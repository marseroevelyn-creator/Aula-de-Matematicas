// =========================================================================
// BLOQUE DE CONFIGURACIÓN, DEPENDENCIAS Y ENTORNO
// =========================================================================
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

// Configuración de Sesiones en Memoria para Autenticación
app.use(session({
    secret: 'secreto_aula_matematica_2026',
    resave: false,
    saveUninitialized: true
}));

// Conexión a Base de Datos en la Nube con Neon
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Configuración de la cuenta de Almacenamiento Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const upload = multer({ dest: 'uploads/' });

// Inicialización del cliente de Inteligencia Artificial Google Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// =========================================================================
// BLOQUE DE AUTENTICACIÓN Y ROLES (INICIO DE SESIÓN)
// =========================================================================

// Endpoint Autocompletado / Predictivo para Alumnos en Login
app.get('/api/auth/buscar-alumnos', async (req, res) => {
    const { q } = req.query;
    try {
        const query = `
            SELECT a.id, a.nombre, c.nombre as curso_nombre 
            FROM alumnos a 
            JOIN cursos c ON a.curso_id = c.id 
            WHERE a.nombre ILIKE $1 LIMIT 5`;
        const result = await pool.query(query, [`%${q}%`]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login Unificado (Alumnos y Docente)
app.post('/api/auth/login', async (req, res) => {
    const { id, nombre, contrasena, esDocente } = req.body;

    if (esDocente) {
        if (contrasena === "admin123") { // Clave solicitada por la docente
            req.session.user = { role: 'docente', name: 'Profesora' };
            return res.json({ success: true, role: 'docente' });
        }
        return res.status(401).json({ error: 'Contraseña docente incorrecta.' });
    } else {
        try {
            const result = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'Alumno no encontrado.' });
            
            const alumno = result.rows[0];
            if (contrasena === alumno.clave) {
                req.session.user = { id: alumno.id, role: 'alumno', name: alumno.nombre, curso_id: alumno.curso_id };
                return res.json({ success: true, role: 'alumno', primerIngreso: alumno.primer_ingreso });
            }
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
});

// Forzar cambio de clave obligatoria en primer ingreso
app.post('/api/auth/primer-ingreso', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'alumno') return res.status(403).json({ error: 'No autorizado' });
    const { nuevaClave } = req.body;
    if (nuevaClave.length < 4) return res.status(400).json({ error: 'Debe contener al menos 4 dígitos.' });

    try {
        await pool.query('UPDATE alumnos SET clave = $1, primer_ingreso = false WHERE id = $2', [nuevaClave, req.session.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// BLOQUE DE FUNCIONES ADMINISTRATIVAS (PANEL DOCENTE)
// =========================================================================

// Carga global del Dashboard Docente
app.get('/api/docente/dashboard', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos ORDER BY nombre ASC');
        const alumnos = await pool.query('SELECT a.*, c.nombre as curso_nombre FROM alumnos a JOIN cursos c ON a.curso_id = c.id ORDER BY a.nombre ASC');
        const banco = await pool.query('SELECT * FROM banco_tareas ORDER BY tema ASC, id ASC');
        const asignaciones = await pool.query('SELECT ta.*, bt.titulo, bt.tema FROM tareas_asignadas ta JOIN banco_tareas bt ON ta.tarea_id = bt.id');
        
        res.json({ cursos: cursos.rows, alumnos: alumnos.rows, bancoTareas: banco.rows, asignaciones: asignaciones.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CRUD de Cursos (Crear, Editar Link WhatsApp, Eliminar)
app.post('/api/cursos', async (req, res) => {
    const { nombre, whatsapp_link } = req.body;
    try {
        const r = await pool.query('INSERT INTO cursos (nombre, whatsapp_link) VALUES ($1, $2) RETURNING *', [nombre, whatsapp_link]);
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/cursos/:id', async (req, res) => {
    const { nombre, whatsapp_link, fechas_importantes } = req.body;
    try {
        await pool.query('UPDATE cursos SET nombre = $1, whatsapp_link = $2, fechas_importantes = $3 WHERE id = $4', [nombre, whatsapp_link, fechas_importantes, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/cursos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM cursos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Gestión de Alumnos e Inscripción (Clave por defecto: 'usuario')
app.post('/api/alumnos', async (req, res) => {
    const { nombre, curso_id } = req.body;
    try {
        const r = await pool.query('INSERT INTO alumnos (nombre, curso_id, clave, primer_ingreso) VALUES ($1, $2, \'usuario\', true) RETURNING *', [nombre, curso_id]);
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alumnos/:id/reiniciar', async (req, res) => {
    try {
        await pool.query('UPDATE alumnos SET clave = \'usuario\', primer_ingreso = true WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Banco de Recursos: Almacenamiento seguro en la Nube
app.post('/api/banco-tareas', upload.single('archivo'), async (req, res) => {
    const { titulo, tema, tipo_recurso, enlace_externo, requiere_entrega } = req.body;
    let archivo_url = null;
    try {
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, { resource_type: "auto" });
            archivo_url = uploadResult.secure_url;
        }
        const r = await pool.query(
            'INSERT INTO banco_tareas (titulo, tema, tipo_recurso, archivo_url, enlace_externo, requiere_entrega) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [titulo, tema, tipo_recurso, archivo_url, enlace_externo, requiere_entrega === 'true']
        );
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Asignaciones Masivas con Control de Prerrequisitos Automáticos
app.post('/api/asignaciones', async (req, res) => {
    const { curso_id, tarea_id, fecha_entrega, prerequisito_id } = req.body;
    try {
        const r = await pool.query(
            'INSERT INTO tareas_asignadas (curso_id, tarea_id, fecha_entrega, prerequisito_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [curso_id, tarea_id, fecha_entrega, prerequisito_id || null]
        );
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Adecuación Curricular: Excluir/Omitir Actividad de Forma Individual
app.post('/api/adecuaciones', async (req, res) => {
    const { alumno_id, tarea_id, omitir } = req.body;
    try {
        if (omitir) {
            await pool.query('INSERT INTO adecuaciones (alumno_id, tarea_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [alumno_id, tarea_id]);
        } else {
            await pool.query('DELETE FROM adecuaciones WHERE alumno_id = $1 AND tarea_id = $2', [alumno_id, tarea_id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Descargar e importar copia de seguridad JSON Completa de la Base de Datos
app.get('/api/docente/backup/exportar', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos');
        const alumnos = await pool.query('SELECT * FROM alumnos');
        const banco = await pool.query('SELECT * FROM banco_tareas');
        const asignaciones = await pool.query('SELECT * FROM tareas_asignadas');
        res.json({ cursos: cursos.rows, alumnos: alumnos.rows, banco_tareas: banco.rows, tareas_asignadas: asignaciones.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// BLOQUE DEL ALUMNO Y CONSULTAS DE INTELIGENCIA ARTIFICIAL (GEMINI)
// =========================================================================

// Cargar Entorno y Actividades del Alumno (Sigue Orden Cronológico y Adecuaciones)
app.get('/api/alumno/dashboard', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'No autenticado' });
    const alumnoId = req.session.user.id;
    const cursoId = req.session.user.curso_id;

    try {
        const cursoInfo = await pool.query('SELECT * FROM cursos WHERE id = $1', [cursoId]);
        const queryTareas = `
            SELECT ta.*, bt.titulo, bt.tema, bt.tipo_recurso, bt.archivo_url, bt.enlace_externo, bt.requiere_entrega,
                   e.completada, e.visto, e.devolucion,
                   (SELECT e2.completada FROM entregas e2 WHERE e2.tarea_id = ta.prerequisito_id AND e2.alumno_id = $1) as prerequisito_cumplido
            FROM tareas_asignadas ta
            JOIN banco_tareas bt ON ta.tarea_id = bt.id
            LEFT JOIN entregas e ON ta.tarea_id = e.tarea_id AND e.alumno_id = $1
            WHERE ta.curso_id = $2 
              AND ta.tarea_id NOT IN (SELECT tarea_id FROM adecuaciones WHERE alumno_id = $1)
            ORDER BY ta.fecha_entrega ASC, ta.fecha_creacion ASC
        `;
        const tareas = await pool.query(queryTareas, [alumnoId, cursoId]);
        res.json({ curso: cursoInfo.rows[0], tareas: tareas.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Marcar Tarea Realizada / Vista (Videos, Test o Documentos)
app.post('/api/alumno/completar-tarea', async (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'No autorizado' });
    const { tarea_id, visto } = req.body;
    const alumno_id = req.session.user.id;

    try {
        await pool.query(`
            INSERT INTO entregas (alumno_id, tarea_id, completada, visto) 
            VALUES ($1, $2, true, $3) 
            ON CONFLICT (alumno_id, tarea_id) DO UPDATE SET completada = true, visto = $3`, 
            [alumno_id, tarea_id, visto || false]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Integración Real y Directa con Gemini API
app.post('/api/gemini/consultar', async (req, res) => {
    const { duda } = req.body;
    if (!duda) return res.status(400).json({ error: 'Consulta vacía.' });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Eres un docente y tutor experto en matemáticas para escuelas secundarias. Responde la siguiente duda de un estudiante de manera clara, pedagógica, paso a paso y utilizando un tono amable y alentador: "${duda}"`,
        });
        res.json({ respuesta: response.text });
    } catch (err) {
        res.status(500).json({ error: 'Inconveniente al contactar con el Tutor Gemini AI.' });
    }
});

// Levantar el Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aula Virtual Matemática activa en puerto: ${PORT}`));
