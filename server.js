const express = require('express');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// BLOQUE: CONFIGURACIONES DE SERVICIOS (Neon, Cloudinary, Gemini)
// ==========================================
// Conexión segura a la base de datos Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Configuración de almacenamiento persistente en Cloudinary para las entregas
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuración de Multer en memoria para procesar la subida temporal de archivos
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Inicialización del motor de Inteligencia Artificial Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "SIN_CLAVE");

// ==========================================
// BLOQUE: CONTROL DE AUTENTICACIÓN Y LOGIN
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { nombre, contrasena, esDocente } = req.body;

        // Login del Profesorado
        if (esDocente) {
            if (contrasena === 'admin123') { // Clave requerida en el PDF original
                return res.json({ success: true, esDocente: true });
            }
            return res.status(401).json({ success: false, error: "Contraseña docente incorrecta." });
        }

        // Login de Alumnos con búsqueda exacta
        const result = await pool.query('SELECT * FROM alumnos WHERE nombre = $1', [nombre]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Alumno no encontrado." });

        const alumno = result.rows[0];
        if (alumno.contrasena === contrasena) {
            const primerIngreso = (contrasena === 'usuario'); // Clave genérica inicial por defecto
            return res.json({ success: true, esDocente: false, primerIngreso, alumnoId: alumno.id });
        }
        return res.status(401).json({ success: false, error: "Contraseña incorrecta." });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error en el servidor de autenticación." });
    }
});

// Buscador Predictivo de Alumnos para la Pantalla de Inicio
app.get('/api/auth/buscar-alumnos', async (req, res) => {
    try {
        const q = req.query.q || '';
        const result = await pool.query(
            `SELECT a.id, a.nombre, c.nombre as curso_nombre 
             FROM alumnos a 
             LEFT JOIN cursos c ON a.curso_id = c.id 
             WHERE a.nombre ILIKE $1 LIMIT 5`,
            [`%${q}%`]
        );
        res.json(result.rows);
    } catch {
        res.json([]);
    }
});

// Cambio de clave obligatoria en el primer ingreso del alumno
app.post('/api/auth/primer-ingreso', async (req, res) => {
    try {
        const { alumnoId, nuevaClave } = req.body;
        if (!nuevaClave || nuevaClave.length < 4) return res.status(400).json({ error: "Mínimo 4 dígitos." });
        await pool.query('UPDATE alumnos SET contrasena = $1 WHERE id = $2', [nuevaClave, alumnoId]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false });
    }
});

// ==========================================
// BLOQUE: COMPONENTE ADMINISTRATIVO DOCENTE
// ==========================================
// Obtener estado global para renderizar el panel docente por dentro
app.get('/api/docente/dashboard', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos ORDER BY nombre ASC');
        const alumnos = await pool.query(`
            SELECT a.id, a.nombre, a.curso_id, a.tareas_omitidas, c.nombre as curso_nombre 
            FROM alumnos a 
            LEFT JOIN cursos c ON a.curso_id = c.id 
            ORDER BY a.nombre ASC`);
        const tareas = await pool.query('SELECT * FROM banco_tareas ORDER BY id DESC');
        const asignadas = await pool.query('SELECT * FROM tareas_asignadas');

        res.json({ cursos: cursos.rows, alumnos: alumnos.rows, bancoTareas: tareas.rows, tareasAsignadas: asignadas.rows });
    } catch {
        res.status(500).json({ error: "Error cargando datos del panel." });
    }
});

// Gestión CRUD de Cursos con Menú Desplegable (Nombre, Eliminar, WhatsApp Link)
app.post('/api/cursos/crear', async (req, res) => {
    try {
        const { nombre } = req.body;
        await pool.query('INSERT INTO cursos (nombre) VALUES ($1)', [nombre]);
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/cursos/editar', async (req, res) => {
    try {
        const { id, nombre } = req.body;
        await pool.query('UPDATE cursos SET nombre = $1 WHERE id = $2', [nombre, id]);
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/cursos/whatsapp', async (req, res) => {
    try {
        const { id, link } = req.body;
        await pool.query('UPDATE cursos SET whatsapp_link = $1 WHERE id = $2', [link, id]);
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/cursos/eliminar', async (req, res) => {
    try {
        const { id } = req.body;
        await pool.query('DELETE FROM cursos WHERE id = $1', [id]);
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

// Gestión de Alumnos e Inclusiones (Añadir, Reiniciar Clave, Adecuación Curricular)
app.post('/api/alumnos/anadir', async (req, res) => {
    try {
        const { nombre, cursoId } = req.body;
        await pool.query('INSERT INTO alumnos (nombre, curso_id, contrasena) VALUES ($1, $2, \'usuario\')', [nombre, cursoId]);
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/alumnos/reiniciar', async (req, res) => {
    try {
        const { id } = req.body;
        await pool.query('UPDATE alumnos SET contrasena = \'usuario\' WHERE id = $1', [id]);
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

// Guardar Adecuación Curricular para Omitir Tareas Individuales
app.post('/api/alumnos/adecuacion', async (req, res) => {
    try {
        const { alumnoId, tareasOmitidas } = req.body; 
        await pool.query('UPDATE alumnos SET tareas_omitidas = $1 WHERE id = $2', [JSON.stringify(tareasOmitidas), alumnoId]);
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

// ==========================================
// BLOQUE: BANCO GLOBAL DE RECURSOS Y TAREAS
// ==========================================
app.post('/api/tareas/crear', async (req, res) => {
    try {
        const { tema, titulo, enlaces, requiereEntrega } = req.body;
        await pool.query(
            'INSERT INTO banco_tareas (tema, titulo, enlaces, requiere_entrega) VALUES ($1, $2, $3, $4)',
            [tema, titulo, JSON.stringify(enlaces || []), requiereEntrega || false]
        );
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/tareas/asignar', async (req, res) => {
    try {
        const { tareaId, cursoId, preRequisitoId } = req.body;
        await pool.query(
            'INSERT INTO tareas_asignadas (tarea_id, curso_id, pre_requisito_id) VALUES ($1, $2, $3)',
            [tareaId, cursoId, preRequisitoId || null]
        );
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

// ==========================================
// BLOQUE: CONSULTAS DIRECTAS A GEMINI AI
// ==========================================
app.post('/api/gemini/consultar', async (req, res) => {
    try {
        const { duda } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Actúas como un profesor de matemática interactivo y de secundaria. Explicación didáctica y comprensible para: ${duda}`;
        const result = await model.generateContent(prompt);
        res.json({ respuesta: result.response.text() });
    } catch (error) {
        res.json({ respuesta: "Tutor Inteligente: Recordá configurar la variable GEMINI_API_KEY en tu entorno de Render para respuestas dinámicas." });
    }
});

// Sincronización e Importación / Exportación JSON de Seguridad Completa
app.get('/api/docente/exportar', async (req, res) => {
    const cursos = await pool.query('SELECT * FROM cursos');
    const alumnos = await pool.query('SELECT * FROM alumnos');
    const tareas = await pool.query('SELECT * FROM banco_tareas');
    res.json({ cursos: cursos.rows, alumnos: alumnos.rows, bancoTareas: tareas.rows });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de Aula Virtual activo en puerto ${PORT}`));
