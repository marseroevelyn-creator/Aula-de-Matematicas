/**
 * SERVIDOR CENTRAL - AULA VIRTUAL DE MATEMÁTICAS
 * Configurado para Render (Efemero), Neon (PostgreSQL Persistente), 
 * Cloudinary (Archivos multimedia) y Google Gemini AI.
 */
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const session = require('express-session');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();

// --- CONFIGURACIÓN DE MIDDLEWARES ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto_seguro_matematica_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 1 día
}));

// --- CONFIGURACIÓN DE RESPALDO Y PERSISTENCIA (NEON Y CLOUDINARY) ---
let pool;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    console.warn("⚠️ ALERTA: No se detectó DATABASE_URL. Usando pool local de respaldo.");
    pool = new Pool();
}

cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'aula_matematica_adjuntos',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'docx', 'mp4']
    }
});
const upload = multer({ storage: storage });

// --- CONFIGURACIÓN DE INTELIGENCIA ARTIFICIAL (GEMINI) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// --- BASE DE DATOS: ESTRUCTURAS ---
const inicializarTablas = async () => {
    if (!process.env.DATABASE_URL) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cursos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                whatsapp_link TEXT
            );
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                rol VARCHAR(50) DEFAULT 'alumno',
                curso_id INTEGER REFERENCES cursos(id) ON DELETE SET NULL,
                debe_cambiar_clave BOOLEAN DEFAULT TRUE
            );
            CREATE TABLE IF NOT EXISTS tareas (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descripcion TEXT,
                carpeta VARCHAR(255) NOT NULL,
                archivo_url TEXT,
                enlace_externo TEXT,
                requiere_entrega BOOLEAN DEFAULT FALSE,
                fecha_entrega TIMESTAMP,
                prerrequisito_id INTEGER REFERENCES tareas(id) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS asignaciones (
                id SERIAL PRIMARY KEY,
                alumno_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                tarea_id INTEGER REFERENCES tareas(id) ON DELETE CASCADE,
                excluido BOOLEAN DEFAULT FALSE,
                entregado BOOLEAN DEFAULT FALSE,
                archivo_entrega_url TEXT,
                devolucion TEXT,
                completada BOOLEAN DEFAULT FALSE,
                visto BOOLEAN DEFAULT FALSE
            );
            CREATE TABLE IF NOT EXISTS fechas_importantes (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMP NOT NULL,
                evento TEXT NOT NULL
            );
        `);
        console.log("⚡ Estructuras de tablas verificadas.");
    } catch (err) {
        console.error("❌ Error en tablas:", err.message);
    }
};
inicializarTablas();

// =========================================================================
// --- RUTAS DE AUTENTICACIÓN ---
// =========================================================================
app.post('/api/auth/login', async (req, res) => {
    const username = (req.body.username || req.body.usuario || '').toString().trim();
    const password = (req.body.password || req.body.clave || '').toString();
    
    if (!username) return res.status(400).json({ success: false, message: "Usuario vacío." });

    if (username.toLowerCase() === 'profesora' && password === 'admin123') {
        req.session.usuario = { id: 0, username: 'profesora', rol: 'profesora' };
        return res.json({ success: true, rol: 'profesora' });
    }

    if (!process.env.DATABASE_URL) {
        return res.status(500).json({ success: false, message: "Modo Local: Use el usuario 'profesora'." });
    }

    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE LOWER(username) = $1', [username.toLowerCase()]);
        if (resultado.rows.length === 0) return res.status(401).json({ success: false, message: "No existe el usuario." });

        const usuario = resultado.rows[0];
        if (usuario.password !== password) return res.status(401).json({ success: false, message: "Clave incorrecta." });

        req.session.usuario = { id: usuario.id, username: usuario.username, rol: usuario.rol, curso_id: usuario.curso_id };
        res.json({ success: true, rol: usuario.rol, debeCambiar: usuario.debe_cambiar_clave });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error interno de login." });
    }
});

app.post('/api/auth/cambiar-clave', async (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ error: "No autorizado" });
    const { nuevaClave } = req.body;
    try {
        await pool.query('UPDATE usuarios SET password = $1, debe_cambiar_clave = false WHERE id = $2', [nuevaClave, req.session.usuario.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// --- GESTIÓN DE CURSOS (NUEVO: EDITAR Y BORRAR) ---
// =========================================================================
app.get('/api/cursos', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM cursos ORDER BY id ASC');
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cursos', async (req, res) => {
    const { nombre, whatsapp_link } = req.body;
    try {
        const resu = await pool.query('INSERT INTO cursos (nombre, whatsapp_link) VALUES ($1, $2) RETURNING *', [nombre, whatsapp_link]);
        res.json(resu.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/cursos/:id', async (req, res) => {
    const { nombre, whatsapp_link } = req.body;
    try {
        await pool.query('UPDATE cursos SET nombre = $1, whatsapp_link = $2 WHERE id = $3', [nombre, whatsapp_link, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/cursos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM cursos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// --- GESTIÓN DE ALUMNIOS (NUEVO: EDITAR Y CONTROL INDIVIDUAL) ---
// =========================================================================
// =========================================================================
// 👥 ENDPOINTS DE GESTIÓN DE USUARIOS / ALUMNOS
// =========================================================================

// --- Obtener listado global de usuarios (Para predicción en Login) ---
app.get('/api/usuarios', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT id, username, rol, curso_id FROM usuarios ORDER BY username ASC');
        res.json(resultado.rows);
    } catch (err) {
        console.error("Error al obtener usuarios:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Registrar un nuevo alumno ---
app.post('/api/usuarios', async (req, res) => {
    let { username, password, rol, curso_id } = req.body;
    try {
        if (!username || username.trim() === "") {
            return res.status(400).json({ success: false, error: "El nombre de usuario es obligatorio." });
        }

        // Sanitización para evitar fallos de integridad por curso nulo o indefinido
        let idCurso = null;
        if (curso_id && curso_id !== "null" && curso_id !== "") {
            idCurso = parseInt(curso_id);
        }

        // Insertar en la base de datos con contraseña inicial y flag para forzar cambio
        const nuevoUsuario = await pool.query(
            `INSERT INTO usuarios (username, password, rol, curso_id, debe_cambiar_clave) 
             VALUES ($1, $2, $3, $4, true) RETURNING id, username`,
            [username.trim(), password || 'usuario', rol || 'alumno', idCurso]
        );

        // Opcional: Si se asigna a un curso, vincular automáticamente las tareas existentes de ese curso
        if (idCurso) {
            const tareasCurso = await pool.query('SELECT tarea_id FROM curso_tareas WHERE curso_id = $1', [idCurso]);
            for (let t of tareasCurso.rows) {
                await pool.query(
                    `INSERT INTO asignaciones (alumno_id, tarea_id, excluido, entregado, completada, visto) 
                     VALUES ($1, $2, false, false, false, false) 
                     ON CONFLICT DO NOTHING`,
                    [nuevoUsuario.rows[0].id, t.tarea_id]
                );
            }
        }

        res.status(201).json({ success: true, usuario: nuevoUsuario.rows[0] });
    } catch (err) {
        console.error("Error al crear usuario:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Editar nombre o curso de un alumno existente ---
app.put('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    let { username, curso_id } = req.body;
    try {
        if (!username || username.trim() === "") {
            return res.status(400).json({ success: false, error: "El nombre no puede estar vacío." });
        }

        let idCurso = null;
        if (curso_id && curso_id !== "null" && curso_id !== "") {
            idCurso = parseInt(curso_id);
        }

        const resultado = await pool.query(
            'UPDATE usuarios SET username = $1, curso_id = $2 WHERE id = $3 RETURNING *',
            [username.trim(), idCurso, id]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({ success: false, error: "El alumno especificado no existe." });
        }

        res.json({ success: true, message: "Datos del estudiante actualizados.", alumno: resultado.rows[0] });
    } catch (err) {
        console.error("Error al editar usuario:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Eliminar un alumno de forma permanente ---
app.delete('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Al eliminar el usuario, las cascadas de la BD se encargan de limpiar asignaciones
        const resultado = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        if (resultado.rowCount === 0) {
            return res.status(404).json({ success: false, error: "Usuario no encontrado." });
        }
        res.json({ success: true, message: "Estudiante dado de baja del sistema correctamente." });
    } catch (err) {
        console.error("Error al eliminar usuario:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});
// =========================================================================
// --- BANCO DE TAREAS (NUEVO: EDITAR TAREAS EXISTENTES Y PRERREQUISITOS CORREGIDOS) ---
// =========================================================================
app.get('/api/tareas', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM tareas ORDER BY id DESC');
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tareas', upload.single('archivo'), async (req, res) => {
    const { titulo, descripcion, carpeta, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id } = req.body;
    const archivoUrl = req.file ? req.file.path : null;
    try {
        const preId = (prerrequisito_id && prerrequisito_id !== 'null' && prerrequisito_id !== '') ? parseInt(prerrequisito_id) : null;
        const resultado = await pool.query(
            `INSERT INTO tareas (titulo, descripcion, carpeta, archivo_url, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [titulo, descripcion, carpeta, archivoUrl, enlace_externo, requiere_entrega === 'true', fecha_entrega || null, preId]
        );
        res.json(resultado.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tareas/:id', upload.single('archivo'), async (req, res) => {
    const { titulo, descripcion, carpeta, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id } = req.body;
    try {
        const preId = (prerrequisito_id && prerrequisito_id !== 'null' && prerrequisito_id !== '') ? parseInt(prerrequisito_id) : null;
        let query = `UPDATE tareas SET titulo=$1, descripcion=$2, carpeta=$3, enlace_externo=$4, requiere_entrega=$5, fecha_entrega=$6, prerrequisito_id=$7`;
        let params = [titulo, descripcion, carpeta, enlace_externo, requiere_entrega === 'true', fecha_entrega || null, preId];
        
        if (req.file) {
            query += `, archivo_url=$8 WHERE id=$9`;
            params.push(req.file.path, req.params.id);
        } else {
            query += ` WHERE id=$8`;
            params.push(req.params.id);
        }
        await pool.query(query, params);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tareas/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM tareas WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// --- GESTIÓN DE ASIGNACIONES INDIVIDUALES Y EXCLUSIONES ---
// =========================================================================
app.get('/api/usuarios/:alumnoId/asignaciones', async (req, res) => {
    try {
        const resu = await pool.query('SELECT * FROM asignaciones WHERE alumno_id = $1', [req.params.alumnoId]);
        res.json(resu.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alternar estado de exclusión o asignación directa individual
app.post('/api/asignaciones/individual', async (req, res) => {
    const { alumno_id, tarea_id, estado } = req.body; // estado: 'asignar', 'excluir', 'quitar_excluir'
    try {
        const existe = await pool.query('SELECT id FROM asignaciones WHERE alumno_id = $1 AND tarea_id = $2', [alumno_id, tarea_id]);
        
        if (estado === 'asignar') {
            if (existe.rows.length === 0) {
                await pool.query('INSERT INTO asignaciones (alumno_id, tarea_id, excluido) VALUES ($1, $2, false)');
            } else {
                await pool.query('UPDATE asignaciones SET excluido = false WHERE alumno_id = $1 AND tarea_id = $2', [alumno_id, tarea_id]);
            }
        } else if (estado === 'excluir') {
            if (existe.rows.length === 0) {
                await pool.query('INSERT INTO asignaciones (alumno_id, tarea_id, excluido) VALUES ($1, $2, true)');
            } else {
                await pool.query('UPDATE asignaciones SET excluido = true WHERE alumno_id = $1 AND tarea_id = $2', [alumno_id, tarea_id]);
            }
        } else if (estado === 'eliminar') {
            await pool.query('DELETE FROM asignaciones WHERE alumno_id = $1 AND tarea_id = $2', [alumno_id, tarea_id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/asignar-grupo', async (req, res) => {
    const { curso_id, tarea_id } = req.body;
    try {
        const alumnos = await pool.query('SELECT id FROM usuarios WHERE curso_id = $1 AND rol = \'alumno\'', [curso_id]);
        for (let alu of alumnos.rows) {
            const existe = await pool.query('SELECT id FROM asignaciones WHERE alumno_id = $1 AND tarea_id = $2', [alu.id, tarea_id]);
            if (existe.rows.length === 0) {
                await pool.query('INSERT INTO asignaciones (alumno_id, tarea_id) VALUES ($1, $2)', [alu.id, tarea_id]);
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/asignaciones/curso/:cursoId/tarea/:tareaId', async (req, res) => {
    try {
        await pool.query(`
            DELETE FROM asignaciones 
            WHERE tarea_id = $1 AND alumno_id IN (SELECT id FROM usuarios WHERE curso_id = $2)
        `, [req.params.tareaId, req.params.cursoId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// --- REVISIÓN Y REASIGNACIÓN DE TAREAS (NUEVO: REASIGNAR SI HIZO MAL) ---
// =========================================================================
app.get('/api/asignaciones/tarea/:tareaId/entregas', async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.username as alumno_nombre
            FROM asignaciones a
            JOIN usuarios u ON a.alumno_id = u.id
            WHERE a.tarea_id = $1 AND (a.entregado = true OR a.visto = true OR a.archivo_entrega_url IS NOT NULL)
        `;
        const resultado = await pool.query(query, [req.params.tareaId]);
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/:id/corregir', async (req, res) => {
    const { devolucion, completada } = req.body;
    try {
        await pool.query(
            'UPDATE asignaciones SET devolucion = $1, completada = $2 WHERE id = $3',
            [devolucion, completada, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NUEVO ENDPOINT: Permite reasignar una tarea limpiando los bloqueos para que la rehagan
app.post('/api/asignaciones/:id/reasignar', async (req, res) => {
    const { motivo } = req.body;
    try {
        await pool.query(
            `UPDATE asignaciones 
             SET entregado = false, completada = false, visto = false, archivo_entrega_url = NULL, devolucion = $1 
             WHERE id = $2`,
            [motivo || "Tarea reasignada por la profesora para corrección.", req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// --- INTERFAZ DEL ESTUDIANTE: EVALUACIÓN INTELIGENTE DE PRERREQUISITOS Y TEMAS ---
// =========================================================================
app.get('/api/alumno/dashboard', async (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ error: "No autenticado" });
    const alumnoId = req.session.usuario.id;
    try {
        const infoCurso = await pool.query(`SELECT c.* FROM cursos c JOIN usuarios u ON u.curso_id = c.id WHERE u.id = $1`, [alumnoId]);
        
        // Trae todas las asignadas evaluando si los prerrequisitos están realmente completados
        const queryTareas = `
            SELECT a.id as asignacion_id, a.entregado, a.completada, a.visto, a.devolucion,
                   t.id as tarea_id, t.titulo, t.descripcion, t.carpeta, t.archivo_url, t.enlace_externo, t.requiere_entrega, t.fecha_entrega, t.prerrequisito_id,
                   (SELECT completada FROM asignaciones WHERE alumno_id = $1 AND tarea_id = t.prerrequisito_id LIMIT 1) as prerrequisito_completado
            FROM asignaciones a
            JOIN tareas t ON a.tarea_id = t.id
            WHERE a.alumno_id = $1 AND a.excluido = false
            ORDER BY t.id ASC
        `;
        const tareas = await pool.query(queryTareas, [alumnoId]);

        res.json({
            usuario: req.session.usuario.username,
            curso: infoCurso.rows[0] || { nombre: "Sin Asignar", whatsapp_link: null },
            tareas: tareas.rows
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/:id/entregar', upload.single('archivo'), async (req, res) => {
    const archivoEntregaUrl = req.file ? req.file.path : null;
    try {
        await pool.query('UPDATE asignaciones SET entregado = true, archivo_entrega_url = $1 WHERE id = $2', [archivoEntregaUrl, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/:id/visto', async (req, res) => {
    try {
        await pool.query('UPDATE asignaciones SET visto = true, completada = true WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// --- RUTAS DE RESPALDO, FECHAS Y GEMINI ---
// =========================================================================
app.get('/api/fechas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM fechas_importantes ORDER BY fecha ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/fechas', async (req, res) => {
    const { fecha, evento } = req.body;
    try {
        await pool.query('INSERT INTO fechas_importantes (fecha, evento) VALUES ($1, $2)', [fecha, evento]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/fechas/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM fechas_importantes WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/gemini', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el mensaje." });
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const contextoMatematico = `Eres un tutor experto en matemáticas de nivel secundario. Explica de forma clara, didáctica y paso a paso. Consulta: ${prompt}`;
        const result = await model.generateContent(contextoMatematico);
        const response = await result.response;
        res.json({ respuesta: response.text() });
    } catch (err) {
        res.json({ respuesta: "🤖 Hola. En este momento estoy recalculando ecuaciones. ¡Prueba de nuevo en unos instantes!" });
    }
});

app.get('/api/cursos/:id/alumnos-progreso', async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT u.id, u.username,
            COALESCE(ROUND((COUNT(CASE WHEN a.completada = true THEN 1 END) * 100.0) / NULLIF(COUNT(a.id), 0)), 0) as progreso
            FROM usuarios u
            LEFT JOIN asignaciones a ON u.id = a.alumno_id AND a.excluido = false
            WHERE u.curso_id = $1 AND u.rol = 'alumno'
            GROUP BY u.id, u.username
        `, [req.params.id]);
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sistema/respaldo', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos');
        const usuarios = await pool.query('SELECT * FROM usuarios');
        const tareas = await pool.query('SELECT * FROM tareas');
        const asignaciones = await pool.query('SELECT * FROM asignaciones');
        const fechas = await pool.query('SELECT * FROM fechas_importantes');
        res.json({ cursos: cursos.rows, usuarios: usuarios.rows, tareas: tareas.rows, asignaciones: asignaciones.rows, fechas_importantes: fechas.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }/**
 * SERVIDOR CENTRAL - AULA VIRTUAL DE MATEMÁTICAS
 * Configurado para Render (Efemero), Neon (PostgreSQL Persistente), 
 * Cloudinary (Archivos multimedia) y Google Gemini AI.
 */
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const session = require('express-session');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();

// --- CONFIGURACIÓN DE MIDDLEWARES ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto_seguro_matematica_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 1 día
}));

// --- CONFIGURACIÓN DE RESPALDO Y PERSISTENCIA (NEON Y CLOUDINARY) ---
let pool;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    console.warn("⚠️ ALERTA: No se detectó DATABASE_URL en el entorno. Creando pool simulado.");
    pool = new Pool(); // Caída por defecto
}

cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'aula_matematica_adjuntos',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'docx', 'mp4']
    }
});
const upload = multer({ storage: storage });

// --- CONFIGURACIÓN DE INTELIGENCIA ARTIFICIAL (GEMINI) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// --- BASE DE DATOS: CREACIÓN DE TABLAS INICIALES SI NO EXISTEN ---
const inicializarTablas = async () => {
    if (!process.env.DATABASE_URL) {
        console.log("ℹ️ Saltando inicialización de tablas: Ejecución local sin base de datos enlazada.");
        return;
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cursos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                whatsapp_link TEXT
            );
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                rol VARCHAR(50) DEFAULT 'alumno',
                curso_id INTEGER REFERENCES cursos(id) ON DELETE SET NULL,
                debe_cambiar_clave BOOLEAN DEFAULT TRUE
            );
            CREATE TABLE IF NOT EXISTS tareas (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descripcion TEXT,
                carpeta VARCHAR(255) NOT NULL,
                archivo_url TEXT,
                enlace_externo TEXT,
                requiere_entrega BOOLEAN DEFAULT FALSE,
                fecha_entrega TIMESTAMP,
                prerrequisito_id INTEGER REFERENCES tareas(id) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS asignaciones (
                id SERIAL PRIMARY KEY,
                alumno_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                tarea_id INTEGER REFERENCES tareas(id) ON DELETE CASCADE,
                excluido BOOLEAN DEFAULT FALSE,
                entregado BOOLEAN DEFAULT FALSE,
                archivo_entrega_url TEXT,
                devolucion TEXT,
                completada BOOLEAN DEFAULT FALSE,
                visto BOOLEAN DEFAULT FALSE
            );
            CREATE TABLE IF NOT EXISTS fechas_importantes (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMP NOT NULL,
                evento TEXT NOT NULL
            );
        `);
        console.log("⚡ Estructuras de tablas en Neon verificadas con éxito.");
    } catch (err) {
        console.error("❌ Falló inicialización de tablas en Neon:", err.message);
    }
};
inicializarTablas();

// =========================================================================
// --- RUTAS DE AUTENTICACIÓN Y CONTROL DE ACCESO ---
// =========================================================================
app.post('/api/auth/login', async (req, res) => {
    const usuarioRecibido = req.body.username || req.body.usuario || '';
    const passwordRecibido = req.body.password || req.body.clave || '';

    const username = usuarioRecibido.toString().trim();
    const password = passwordRecibido.toString();
    
    if (!username) {
        return res.status(400).json({ success: false, message: "El campo de usuario no puede estar vacío." });
    }

    // Admin estático por bocetos de la profesora (Funciona siempre, incluso offline)
    if (username.toLowerCase() === 'profesora' && password === 'admin123') {
        req.session.usuario = { id: 0, username: 'profesora', rol: 'profesora' };
        return res.json({ success: true, rol: 'profesora' });
    }

    if (!process.env.DATABASE_URL) {
        return res.status(500).json({ success: false, message: "Modo local: Solo el usuario 'profesora' está disponible sin Neon configurado." });
    }

    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE LOWER(username) = $1', [username.toLowerCase()]);
        if (resultado.rows.length === 0) {
            return res.status(401).json({ success: false, message: "El usuario no existe." });
        }

        const usuario = resultado.rows[0];
        if (usuario.password !== password) {
            return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
        }

        req.session.usuario = { id: usuario.id, username: usuario.username, rol: usuario.rol, curso_id: usuario.curso_id };
        res.json({ success: true, rol: usuario.rol, debeCambiar: usuario.debe_cambiar_clave });
    } catch (err) {
        console.error("Error en login:", err);
        res.status(500).json({ success: false, message: "Error interno en el servidor." });
    }
});

app.post('/api/auth/cambiar-clave', async (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ error: "No autorizado" });
    const { nuevaClave } = req.body;
    try {
        await pool.query('UPDATE usuarios SET password = $1, debe_cambiar_clave = false WHERE id = $2', [nuevaClave, req.session.usuario.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// --- RUTAS DE ADMINISTRACIÓN: CONTROL DE ESTUDIANTES ---
// =========================================================================
app.get('/api/usuarios', async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
        const resultado = await pool.query('SELECT id, username, rol, curso_id, debe_cambiar_clave FROM usuarios');
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/usuarios', async (req, res) => {
    const { username, password, rol, curso_id } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, error: "El usuario y contraseña son requeridos." });
    }

    try {
        const limpioCursoId = (curso_id && !isNaN(parseInt(curso_id))) ? parseInt(curso_id) : null;

        const resultado = await pool.query(
            `INSERT INTO usuarios (username, password, rol, curso_id, debe_cambiar_clave) 
             VALUES ($1, $2, $3, $4, true) RETURNING id, username, rol`,
            [username.toLowerCase().trim(), password, rol || 'alumno', limpioCursoId]
        );

        res.status(201).json({ success: true, id: resultado.rows[0].id, usuario: resultado.rows[0].username });
    } catch (err) {
        console.error("❌ Error al insertar usuario:", err.message);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: "El nombre de usuario ya está registrado." });
        }
        res.status(500).json({ success: false, error: "Error de persistencia: " + err.message });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// --- RUTAS DE ADMINISTRACIÓN: CURSOS ---
// =========================================================================
app.get('/api/cursos', async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
        const resultado = await pool.query('SELECT * FROM cursos ORDER BY id ASC');
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/cursos', async (req, res) => {
    const { nombre, whatsapp_link } = req.body;
    try {
        const resu = await pool.query('INSERT INTO cursos (nombre, whatsapp_link) VALUES ($1, $2) RETURNING *', [nombre, whatsapp_link]);
        res.json(resu.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/cursos/:id/alumnos-progreso', async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
        const { id } = req.params;
        const queryAlumnos = `
            SELECT u.id, u.username,
            COALESCE(
                ROUND(
                    (COUNT(CASE WHEN a.completada = true THEN 1 END) * 100.0) / 
                    NULLIF(COUNT(a.id), 0)
                ), 0
            ) as progreso
            FROM usuarios u
            LEFT JOIN asignaciones a ON u.id = a.alumno_id
            WHERE u.curso_id = $1 AND u.rol = 'alumno'
            GROUP BY u.id, u.username
        `;
        const resultado = await pool.query(queryAlumnos, [id]);
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// --- RUTAS DE ADMINISTRACIÓN: BANCO DE TAREAS Y ASIGNACIONES ---
// =========================================================================
app.get('/api/tareas', async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
        const resultado = await pool.query('SELECT * FROM tareas ORDER BY id DESC');
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tareas', upload.single('archivo'), async (req, res) => {
    const { titulo, descripcion, carpeta, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id } = req.body;
    const archivoUrl = req.file ? req.file.path : null;

    try {
        const preId = (prerrequisito_id && prerrequisito_id !== 'null' && prerrequisito_id !== '') ? parseInt(prerrequisito_id) : null;
        const limiteFecha = fecha_entrega ? fecha_entrega : null;

        const resultado = await pool.query(
            `INSERT INTO tareas (titulo, descripcion, carpeta, archivo_url, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [titulo, descripcion, carpeta, archivoUrl, enlace_externo, requiere_entrega === 'true', limiteFecha, preId]
        );
        res.json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/cursos/:cursoId/tareas', async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
        const { cursoId } = req.params;
        const query = `
            SELECT DISTINCT t.*, p.titulo as prerrequisito_titulo
            FROM tareas t
            JOIN asignaciones visions ON t.id = visions.tarea_id
            JOIN usuarios u ON visions.alumno_id = u.id
            LEFT JOIN tareas p ON t.prerrequisito_id = p.id
            WHERE u.curso_id = $1
        `;
        const resultado = await pool.query(query, [cursoId]);
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/asignaciones/asignar-grupo', async (req, res) => {
    const { curso_id, tarea_id } = req.body;
    try {
        const alumnos = await pool.query('SELECT id FROM usuarios WHERE curso_id = $1 AND rol = \'alumno\'', [curso_id]);
        for (let alu of alumnos.rows) {
            const existe = await pool.query('SELECT id FROM asignaciones WHERE alumno_id = $1 AND tarea_id = $2', [alu.id, tarea_id]);
            if (existe.rows.length === 0) {
                await pool.query('INSERT INTO asignaciones (alumno_id, tarea_id) VALUES ($1, $2)', [alu.id, tarea_id]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/asignaciones/curso/:cursoId/tarea/:tareaId', async (req, res) => {
    const { cursoId, tareaId } = req.params;
    try {
        await pool.query(`
            DELETE FROM asignaciones 
            WHERE tarea_id = $1 AND alumno_id IN (SELECT id FROM usuarios WHERE curso_id = $2)
        `, [tareaId, cursoId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// --- RUTAS DE ADMINISTRACIÓN: REVISIÓN DE ENTREGAS ---
// =========================================================================
app.get('/api/asignaciones/tarea/:tareaId/entregas', async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
        const query = `
            SELECT a.*, u.username as alumno_nombre
            FROM asignaciones a
            JOIN usuarios u ON a.alumno_id = u.id
            WHERE a.tarea_id = $1 AND (a.entregado = true OR a.visto = true OR a.archivo_entrega_url IS NOT NULL)
        `;
        const resultado = await pool.query(query, [req.params.tareaId]);
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/asignaciones/:id/corregir', async (req, res) => {
    const { devolucion, completada } = req.body;
    try {
        await pool.query(
            'UPDATE asignaciones SET devolucion = $1, completada = $2 WHERE id = $3',
            [devolucion, completada, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// --- GESTIÓN DE FECHAS IMPORTANTES ---
// =========================================================================
app.get('/api/fechas', async (req, res) => {
    if (!process.env.DATABASE_URL) return res.json([]);
    try {
        const result = await pool.query('SELECT * FROM fechas_importantes ORDER BY fecha ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fechas', async (req, res) => {
    const { fecha, evento } = req.body;
    try {
        await pool.query('INSERT INTO fechas_importantes (fecha, evento) VALUES ($1, $2)', [fecha, evento]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/fechas/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM fechas_importantes WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// --- INTERFAZ DEL ESTUDIANTE: FEED INTERACTIVO Y DASHBOARD ---
// =========================================================================
app.get('/api/alumno/dashboard', async (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ error: "No autenticado" });
    const alumnoId = req.session.usuario.id;

    try {
        const infoCurso = await pool.query(`
            SELECT c.* FROM cursos c 
            JOIN usuarios u ON u.curso_id = c.id 
            WHERE u.id = $1
        `, [alumnoId]);

        const queryTareas = `
            SELECT a.id as asignacion_id, a.entregado, a.completada, a.visto, a.devolucion,
                   t.id as tarea_id, t.titulo, t.descripcion, t.carpeta, t.archivo_url, t.enlace_externo, t.requiere_entrega, t.fecha_entrega
            FROM asignaciones a
            JOIN tareas t ON a.tarea_id = t.id
            WHERE a.alumno_id = $1 AND a.excluido = false
            ORDER BY t.fecha_entrega ASC NULLS LAST, t.id ASC
        `;
        const tareas = await pool.query(queryTareas, [alumnoId]);

        res.json({
            usuario: req.session.usuario.username,
            curso: infoCurso.rows[0] || { nombre: "Sin Asignar", whatsapp_link: null },
            tareas: tareas.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/asignaciones/:id/entregar', upload.single('archivo'), async (req, res) => {
    const archivoEntregaUrl = req.file ? req.file.path : null;
    try {
        await pool.query(
            'UPDATE asignaciones SET entregado = true, archivo_entrega_url = $1 WHERE id = $2',
            [archivoEntregaUrl, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/asignaciones/:id/visto', async (req, res) => {
    try {
        await pool.query('UPDATE asignaciones SET visto = true, completada = true WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// --- INTEGRACIÓN REAL CON INTEGRIDAD DE IA (GEMINI TUTOR) ---
// =========================================================================
app.post('/api/gemini', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el mensaje." });

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const contextoMatematico = `Eres un tutor experto en matemáticas de nivel secundario. Tu objetivo es explicar los temas de manera clara, didáctica, paso a paso y amable. Usa emoticonos apropiados. Intenta guiar al alumno en lugar de solo darle la respuesta directa si es un ejercicio complejo. Pregunta del alumno: ${prompt}`;
        
        const result = await model.generateContent(contextoMatematico);
        const response = await result.response;
        res.json({ respuesta: response.text() });
    } catch (err) {
        console.error("Error en Gemini AI:", err);
        res.json({ respuesta: "🤖 Hola, disculpa. En este momento estoy recalculando algunas ecuaciones y no pude procesar tu consulta. ¡Prueba de nuevo en unos instantes!" });
    }
});


// =========================================================================
// --- COPIAS DE SEGURIDAD INTERNAS ---
// =========================================================================
app.get('/api/sistema/respaldo', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos');
        const usuarios = await pool.query('SELECT * FROM usuarios');
        const tareas = await pool.query('SELECT * FROM tareas');
        const asignaciones = await pool.query('SELECT * FROM asignaciones');
        const fechas = await pool.query('SELECT * FROM fechas_importantes');

        const backupData = {
            cursos: cursos.rows,
            usuarios: usuarios.rows,
            tareas: tareas.rows,
            asignaciones: asignaciones.rows,
            fechas_importantes: fechas.rows
        };

        res.setHeader('Content-disposition', 'attachment; filename=respaldo_aula_matematica.json');
        res.setHeader('Content-type', 'application/json');
        res.write(JSON.stringify(backupData, null, 2));
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sistema/restaurar', async (req, res) => {
    const { cursos, usuarios, tareas, asignaciones } = req.body;
    try {
        await pool.query('TRUNCATE asignaciones, tareas, usuarios, cursos, fechas_importantes RESTART IDENTITY CASCADE');
        
        for (let c of cursos) {
            await pool.query('INSERT INTO cursos (id, nombre, whatsapp_link) VALUES ($1, $2, $3)', [c.id, c.nombre, c.whatsapp_link]);
        }
        for (let u of usuarios) {
            await pool.query('INSERT INTO usuarios (id, username, password, rol, curso_id, debe_cambiar_clave) VALUES ($1, $2, $3, $4, $5, $6)', [u.id, u.username, u.password, u.rol, u.curso_id, u.debe_cambiar_clave]);
        }
        for (let t of tareas) {
            await pool.query('INSERT INTO tareas (id, titulo, descripcion, carpeta, archivo_url, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [t.id, t.titulo, t.descripcion, t.carpeta, t.archivo_url, t.enlace_externo, t.requiere_entrega, t.fecha_entrega, t.prerrequisito_id]);
        }
        for (let a of asignaciones) {
            await pool.query('INSERT INTO asignaciones (id, alumno_id, tarea_id, excluido, entregado, archivo_entrega_url, devolucion, completada, visto) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [a.id, a.alumno_id, a.tarea_id, a.excluido, a.entregado, a.archivo_entrega_url, a.devolucion, a.completada, a.visto]);
        }
        res.json({ success: true, message: "Base de datos restaurada con éxito total." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios/:id/reiniciar', async (req, res) => {
    const { id } = req.params;
    try {
        const resultado = await pool.query(
            'UPDATE usuarios SET password = $1, debe_cambiar_clave = true WHERE id = $2',
            ['usuario', id]
        );
        if (resultado.rowCount === 0) {
            return res.status(404).json({ success: false, error: "Usuario no encontrado." });
        }
        res.json({ success: true, message: "Contraseña restablecida correctamente." });
    } catch (err) {
        res.status(500).json({ success: false, error: "Error interno de servidor." });
    }
});

// --- INICIO DE SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor listo y corriendo en el puerto ${PORT}`);
});
