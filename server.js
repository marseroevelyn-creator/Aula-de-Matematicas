// ==========================================
// CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// ==========================================
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const session = require('express-session');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Sesiones para Profesora y Alumnos
app.use(session({
    secret: 'aula_virtual_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Conexión a la Base de Datos Neon (PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
}));

// Conexión a Cloudinary para Respaldo de Archivos
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const upload = multer({ dest: 'uploads/' });

// Inicialización de la API de Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ==========================================
// ENDPOINTS DE AUTENTICACIÓN
// ==========================================

// Login unificado con redirección según rol
app.post('/api/login', async (req, res) => {
    const { nombre, contrasena, esDocente } = req.body;

    if (esDocente) {
        if (contrasena === "admin123") { // Clave temporal solicitada
            req.session.user = { role: 'docente', name: 'Profesora' };
            return res.json({ success: true, redirect: '/docente' });
        }
        return res.status(401).json({ error: 'Contraseña docente incorrecta' });
    } else {
        try {
            const result = await pool.query('SELECT * FROM alumnos WHERE nombre = $1', [nombre]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'Alumno no encontrado' });
            
            const alumno = result.rows[0];
            if (contrasena === alumno.clave) {
                req.session.user = { id: alumno.id, role: 'alumno', name: alumno.nombre, curso_id: alumno.curso_id, primer_ingreso: alumno.primer_ingreso };
                return res.json({ success: true, primerIngreso: alumno.primer_ingreso, redirect: '/alumno' });
            }
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
});

// Cambio de contraseña obligatorio en primer ingreso
app.post('/api/alumno/cambiar-clave', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'alumno') return res.status(403).json({ error: 'No autorizado' });
    const { nuevaClave } = req.body;
    if (nuevaClave.length < 4) return res.status(400).json({ error: 'La clave debe tener al menos 4 dígitos' });

    try {
        await pool.query('UPDATE alumnos SET clave = $1, primer_ingreso = false WHERE id = $2', [nuevaClave, req.session.user.id]);
        req.session.user.primer_ingreso = false;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ENDPOINTS DEL PANEL DOCENTE (GESTIÓN)
// ==========================================

// Obtener datos del panel de control de la profesora
app.get('/api/docente/dashboard', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos');
        const alumnos = await pool.query('SELECT a.*, c.nombre as curso_nombre FROM alumnos a JOIN cursos c ON a.curso_id = c.id');
        const tareas = await pool.query('SELECT * FROM banco_tareas');
        const asignaciones = await pool.query('SELECT ta.*, bt.titulo, bt.tema FROM tareas_asignadas ta JOIN banco_tareas bt ON ta.tarea_id = bt.id');
        const entregas = await pool.query('SELECT e.*, a.nombre as alumno_nombre, bt.titulo FROM entregas e JOIN alumnos a ON e.alumno_id = a.id JOIN banco_tareas bt ON e.tarea_id = bt.id WHERE e.corregido = false');

        res.json({ cursos: cursos.rows, alumnos: alumnos.rows, tareas: tareas.rows, asignaciones: asignaciones.rows, entregas: entregas.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear Curso con enlace opcional de WhatsApp
app.post('/api/cursos', async (req, res) => {
    const { nombre, whatsapp_link } = req.body;
    try {
        const nuevoCurso = await pool.query('INSERT INTO cursos (nombre, whatsapp_link) VALUES ($1, $2) RETURNING *', [nombre, whatsapp_link]);
        res.json(nuevoCurso.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Agregar Alumno con contraseña por defecto "usuario"
app.post('/api/alumnos', async (req, res) => {
    const { nombre, curso_id } = req.body;
    try {
        const nuevoAlumno = await pool.query('INSERT INTO alumnos (nombre, curso_id, clave, primer_ingreso) VALUES ($1, $2, \'usuario\', true) RETURNING *', [nombre, curso_id]);
        res.json(nuevoAlumno.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reiniciar clave de alumno si la olvida
app.post('/api/alumnos/:id/reiniciar-clave', async (req, res) => {
    try {
        await pool.query('UPDATE alumnos SET clave = \'usuario\', primer_ingreso = true WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: "Clave reestablecida a 'usuario'" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear Tarea en el Banco Global de Recursos y subir archivo a Cloudinary
app.post('/api/tareas', upload.single('archivo'), async (req, res) => {
    const { titulo, tema, enlace, requiere_entrega } = req.body;
    let fileUrl = null;

    try {
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, { resource_type: "auto" });
            fileUrl = uploadResult.secure_url;
        }
        const nuevaTarea = await pool.query(
            'INSERT INTO banco_tareas (titulo, tema, archivo_url, enlace_externo, requiere_entrega) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [titulo, tema, fileUrl, enlace, requiere_entrega === 'true']
        );
        res.json(nuevaTarea.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Asignar actividad con opción de automatización por prerrequisito
app.post('/api/asignaciones', async (req, res) => {
    const { curso_id, tarea_id, fecha_entrega, prerequisito_tarea_id } = req.body;
    try {
        const asignacion = await pool.query(
            'INSERT INTO tareas_asignadas (curso_id, tarea_id, fecha_entrega, prerequisito_tarea_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [curso_id, tarea_id, fecha_entrega, prerequisito_tarea_id || null]
        );
        res.json(asignacion.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Excluir u omitir tareas de forma adaptativa para un alumno en específico
app.post('/api/adecuacion-curricular', async (req, res) => {
    const { alumno_id, tarea_id, omitir } = req.body;
    try {
        if (omitir) {
            await pool.query('INSERT INTO adecuaciones (alumno_id, tarea_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [alumno_id, tarea_id]);
        } else {
            await pool.query('DELETE FROM adecuaciones WHERE alumno_id = $1 AND tarea_id = $2', [alumno_id, tarea_id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Backup: Exportar toda la base de datos a formato JSON descargable
app.get('/api/docente/exportar', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos');
        const alumnos = await pool.query('SELECT * FROM alumnos');
        const tareas = await pool.query('SELECT * FROM banco_tareas');
        const asignadas = await pool.query('SELECT * FROM tareas_asignadas');
        
        res.json({
            timestamp: new Date(),
            data: { cursos: cursos.rows, alumnos: alumnos.rows, banco_tareas: tareas.rows, tareas_asignadas: asignadas.rows }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ENDPOINTS DEL ALUMNO Y CONSULTAS GEMINI AI
// ==========================================

// Obtener las tareas del Alumno aplicando lógica de orden, pre-requisitos y adecuaciones
app.get('/api/alumno/tareas', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'No autenticado' });
    const alumnoId = req.session.user.id;
    const cursoId = req.session.user.curso_id;

    try {
        const query = `
            SELECT ta.*, bt.titulo, bt.tema, bt.archivo_url, bt.enlace_externo, bt.requiere_entrega,
            EXISTS(SELECT 1 FROM entregas e WHERE e.tarea_id = ta.tarea_id AND e.alumno_id = $1) as realizada
            FROM tareas_asignadas ta
            JOIN banco_tareas bt ON ta.tarea_id = bt.id
            WHERE ta.curso_id = $2
            AND ta.tarea_id NOT IN (SELECT tarea_id FROM adecuaciones WHERE alumno_id = $1)
            ORDER BY ta.fecha_entrega ASC, ta.id ASC
        `;
        const result = await pool.query(query, [alumnoId, cursoId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Integración Real con Gemini API para consultas de matemáticas
app.post('/api/gemini/consultar', async (req, res) => {
    const { duda } = req.body;
    if (!duda) return res.status(400).json({ error: 'La consulta no puede estar vacía' });

    try {
        // Configuramos la personalidad del modelo como un tutor experto de matemáticas amable
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Eres un tutor experto en matemáticas para escuela secundaria. Responde de forma clara, pedagógica y paso a paso a la siguiente consulta de un alumno: "${duda}"`,
        });
        
        res.json({ respuesta: response.text });
    } catch (err) {
        res.status(500).json({ error: 'Error al conectar con el tutor Gemini AI' });
    }
});

// Levantar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor del Aula Virtual ejecutándose en el puerto ${PORT}`));
