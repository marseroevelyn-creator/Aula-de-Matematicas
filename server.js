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
const { GoogleGenerativeAI } = require('@google/generative-ai'); // <-- Cambiado
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
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'aula_matematica_sistema',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'png', 'pdf', 'docx', 'xlsx', 'mp4', 'ggb', 'txt']
    },
});
const upload = multer({ storage: storage });

// Inicialización de Inteligencia Artificial Gemini con la librería clásica
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // <-- Cambiado

// --- INICIALIZACIÓN COMPLETA DEL ESQUEMA DE BASE DE DATOS (NEON) ---
async function initDB() {
    await pool.query(`CREATE TABLE IF NOT EXISTS cursos (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        whatsapp_link TEXT
    );`);

    await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL DEFAULT 'usuario',
        rol TEXT NOT NULL,
        curso_id INT REFERENCES cursos(id) ON DELETE SET NULL,
        debe_cambiar_clave BOOLEAN DEFAULT TRUE
    );`);

    await pool.query(`CREATE TABLE IF NOT EXISTS fechas_importantes (
        id SERIAL PRIMARY KEY,
        curso_id INT REFERENCES cursos(id) ON DELETE CASCADE,
        evento TEXT NOT NULL,
        fecha DATE NOT NULL
    );`);

    await pool.query(`CREATE TABLE IF NOT EXISTS tareas (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        carpeta TEXT NOT NULL DEFAULT 'General',
        archivo_url TEXT,
        enlace_externo TEXT,
        requiere_entrega BOOLEAN DEFAULT FALSE,
        fecha_entrega TIMESTAMP,
        prerrequisito_id INT REFERENCES tareas(id) ON DELETE SET NULL
    );`);

    await pool.query(`CREATE TABLE IF NOT EXISTS asignaciones (
        id SERIAL PRIMARY KEY,
        alumno_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
        tarea_id INT REFERENCES tareas(id) ON DELETE CASCADE,
        excluido BOOLEAN DEFAULT FALSE,
        entregado BOOLEAN DEFAULT FALSE,
        archivo_entrega_url TEXT,
        devolucion TEXT,
        completada BOOLEAN DEFAULT FALSE,
        visto BOOLEAN DEFAULT FALSE,
        respuestas_test JSONB,
        UNIQUE(alumno_id, tarea_id)
    );`);
    
    console.log("-> Estructura relacional en Neon asegurada y verificada correctamente.");
}
initDB().catch(console.error);


// --- BLOQUE: AUTENTICACIÓN Y SEGURIDAD ---
// --- NUEVA FUNCIÓN DE RESTAURACIÓN COMPATIBLE CON TU ARCHIVO VIEJO ---
app.post('/api/sistema/restaurar', express.json({limit: '100mb'}), async (req, res) => {
    // Acepta tanto el formato nuevo como el formato antiguo que subiste
    const cursosInput = req.body.cursos || [];
    const alumnosInput = req.body.usuarios || req.body.alumnos || [];
    const recursosInput = req.body.tareas || req.body.recursos || [];
    
    try {
        // Limpiamos la base de datos para la nueva carga limpia
        await pool.query('TRUNCATE asignaciones, tareas, usuarios, fechas_importantes, cursos RESTART IDENTITY CASCADE');
        
        // 1. Insertar los Cursos
        for (let c of cursosInput) {
            // Si el archivo viejo no tiene link_whatsapp, le ponemos uno vacío por defecto
            const whatsapp = c.whatsapp_link !== undefined ? c.whatsapp_link : (c.link_whatsapp || "");
            await pool.query('INSERT INTO cursos (nombre, whatsapp_link) VALUES ($1, $2)', [c.nombre, whatsapp]);
        }

        // Recuperamos los IDs reales que Neon les asignó a los cursos recién creados
        const cursosDb = await pool.query('SELECT id, nombre FROM cursos');
        const mapaCursos = {};
        cursosDb.rows.forEach(row => { mapaCursos[row.nombre.toUpperCase().trim()] = row.id; });

        // 2. Insertar los Alumnos (Usuarios)
        for (let u of alumnosInput) {
            const nombreUsuario = u.username || u.nombre;
            const passwordUsuario = u.password || u.contrasena || "usuario";
            const cursoNombre = u.curso ? u.curso.toUpperCase().trim() : null;
            const cursoId = mapaCursos[cursoNombre] || null;
            
            // primer_ingreso del archivo viejo se traduce a si debe cambiar clave
            const debeCambiar = u.debe_cambiar_clave !== undefined ? u.debe_cambiar_clave : (u.primer_ingreso == 1);

            await pool.query(
                'INSERT INTO usuarios (username, password, rol, curso_id, debe_cambiar_clave) VALUES ($1, $2, \'alumno\', $3, $4)', 
                [nombreUsuario, passwordUsuario, cursoId, debeCambiar]
            );
        }

        // 3. Insertar las Tareas (Recursos)
        for (let r of recursosInput) {
            const titulo = r.titulo || "Tarea sin título";
            const descripcion = r.descripcion || "";
            const carpeta = r.tema || "General";
            const archivoUrl = r.archivo_url || r.archivo_tarea_url || null;
            const requiereEntrega = r.requiere_entrega == 1 || r.requiere_entrega === true;

            await pool.query(
                'INSERT INTO tareas (titulo, descripcion, carpeta, archivo_url, requiere_entrega) VALUES ($1, $2, $3, $4, $5)',
                [titulo, descripcion, carpeta, archivoUrl, requiereEntrega]
            );
        }

        res.json({ success: true, message: "¡Datos migrados y restaurados con éxito total!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error en la base de datos: " + err.message });
    }
});
    try {
        if (username === 'profesora' && password === (process.env.ADMIN_PASSWORD || 'admin123')) {
            req.session.user = { id: 0, username: 'profesora', rol: 'profesora' };
            return res.json({ success: true, rol: 'profesora' });
        }

        const result = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (user.password === password) {
                req.session.user = { id: user.id, username: user.username, rol: 'alumno', curso_id: user.curso_id };
                return res.json({ 
                    success: true, 
                    rol: 'alumno', 
                    debeCambiar: user.debe_cambiar_clave 
                });
            }
        }
        res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/cambiar-clave', async (req, res) => {
    if (!req.session.user) return res.status(403).send('No autorizado');
    const { nuevaClave } = req.body;
    if (!nuevaClave || nuevaClave.length < 4) {
        return res.status(400).json({ message: 'La clave debe tener al menos 4 caracteres.' });
    }
    try {
        await pool.query('UPDATE usuarios SET password = $1, debe_cambiar_clave = FALSE WHERE id = $2', 
            [nuevaClave, req.session.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});


// --- BLOQUE: GESTIÓN DE CURSOS (PROFESORA) ---
app.get('/api/cursos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM cursos ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cursos', async (req, res) => {
    const { nombre, whatsapp_link } = req.body;
    try {
        const result = await pool.query('INSERT INTO cursos (nombre, whatsapp_link) VALUES ($1, $2) RETURNING *', [nombre, whatsapp_link]);
        res.json(result.rows[0]);
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


// --- BLOQUE: FECHAS IMPORTANTES ---
app.get('/api/fechas/:curso_id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM fechas_importantes WHERE curso_id = $1 ORDER BY fecha ASC', [req.params.curso_id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/fechas', async (req, res) => {
    const { curso_id, evento, fecha } = req.body;
    try {
        await pool.query('INSERT INTO fechas_importantes (curso_id, evento, fecha) VALUES ($1, $2, $3)', [curso_id, evento, fecha]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- BLOQUE: GESTIÓN DE ALUMNOS ---
app.get('/api/alumnos/curso/:curso_id', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, debe_cambiar_clave FROM usuarios WHERE curso_id = $1 AND rol = \'alumno\' ORDER BY username ASC', [req.params.curso_id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alumnos', async (req, res) => {
    const { username, curso_id } = req.body;
    try {
        await pool.query('INSERT INTO usuarios (username, password, rol, curso_id, debe_cambiar_clave) VALUES ($1, \'usuario\', \'alumno\', $2, TRUE)', [username, curso_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/alumnos/:id', async (req, res) => {
    const { username } = req.body;
    try {
        await pool.query('UPDATE usuarios SET username = $1 WHERE id = $2', [username, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alumnos/:id/reiniciar', async (req, res) => {
    try {
        await pool.query('UPDATE usuarios SET password = \'usuario\', debe_cambiar_clave = TRUE WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/alumnos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- BLOQUE: BANCO DE TAREAS ---
app.get('/api/tareas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tareas ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tareas', upload.single('archivo'), async (req, res) => {
    const { titulo, descripcion, carpeta, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id, asignar_a, curso_id } = req.body;
    try {
        const url_final = req.file ? req.file.path : (req.body.google_drive_url || null);
        const nuevaTarea = await pool.query(
            `INSERT INTO tareas (titulo, descripcion, carpeta, archivo_url, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [titulo, descripcion, carpeta, url_final, enlace_externo, requiere_entrega === 'true', fecha_entrega || null, prerrequisito_id ? parseInt(prerrequisito_id) : null]
        );

        const tId = nuevaTarea.rows[0].id;

        if (asignar_a === 'todo_el_curso' && curso_id) {
            const alumnos = await pool.query('SELECT id FROM usuarios WHERE curso_id = $1 AND rol = \'alumno\'', [curso_id]);
            for (let alumno of alumnos.rows) {
                await pool.query('INSERT INTO asignaciones (alumno_id, tarea_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [alumno.id, tId]);
            }
        }
        res.json(nuevaTarea.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/configurar', async (req, res) => {
    const { alumno_id, tarea_id, excluido } = req.body;
    try {
        await pool.query(
            `INSERT INTO asignaciones (alumno_id, tarea_id, excluido) VALUES ($1, $2, $3) 
             ON CONFLICT (alumno_id, tarea_id) DO UPDATE SET excluido = $3`,
            [alumno_id, tarea_id, excluido]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- BLOQUE: ENTREGAS ---
app.get('/api/entregas/tarea/:tarea_id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT a.*, u.username FROM asignaciones a 
             JOIN usuarios u ON a.alumno_id = u.id 
             WHERE a.tarea_id = $1 AND a.entregado = TRUE`, [req.params.tarea_id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/entregas/:tarea_id/alumno', upload.single('entrega'), async (req, res) => {
    if (!req.session.user) return res.status(403).send('No logueado');
    const { tarea_id } = req.params;
    const alId = req.session.user.id;
    try {
        const fileUrl = req.file ? req.file.path : null;
        await pool.query(
            `INSERT INTO asignaciones (alumno_id, tarea_id, entregado, archivo_entrega_url, completada) 
             VALUES ($1, $2, TRUE, $3, TRUE) 
             ON CONFLICT (alumno_id, tarea_id) DO UPDATE SET entregado = TRUE, archivo_entrega_url = $3, completada = TRUE`,
            [alId, tarea_id, fileUrl]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devolucion/:id', async (req, res) => {
    const { devolucion, reiniciar } = req.body;
    try {
        if (reiniciar) {
            await pool.query('UPDATE asignaciones SET entregado = FALSE, archivo_entrega_url = NULL, completada = FALSE WHERE id = $1', [req.params.id]);
        } else {
            await pool.query('UPDATE asignaciones SET devolucion = $1 WHERE id = $1', [devolucion]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- BLOQUE: ESPACIO ALUMNO ---
app.get('/api/alumno/dashboard', async (req, res) => {
    if (!req.session.user) return res.status(403).send('No autorizado');
    const alId = req.session.user.id;
    const cId = req.session.user.curso_id;

    try {
        const cursoInfo = await pool.query('SELECT * FROM cursos WHERE id = $1', [cId]);
        const fechas = await pool.query('SELECT * FROM fechas_importantes WHERE curso_id = $1 ORDER BY fecha ASC', [cId]);
        
        const tareasRaw = await pool.query(`
            SELECT t.*, a.entregado, a.completada, a.devolucion, a.excluido, a.visto
            FROM tareas t
            LEFT JOIN asignaciones a ON t.id = a.tarea_id AND a.alumno_id = $1
            WHERE a.excluido IS NOT TRUE OR a.excluido IS NULL
            ORDER BY t.id ASC
        `, [alId]);

        let tareasDisponibles = [];
        const completadasIds = new Set(tareasRaw.rows.filter(r => r.completada).map(r => r.id));

        for (let tarea of tareasRaw.rows) {
            if (!tarea.prerrequisito_id || completadasIds.has(tarea.prerrequisito_id)) {
                tareasDisponibles.push(tarea);
            }
        }

        res.json({
            usuario: req.session.user.username,
            curso: cursoInfo.rows[0] || { nombre: 'Sin Curso', whatsapp_link: '#' },
            fechas: fechas.rows,
            tareas: tareasDisponibles
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alumno/video-visto/:tarea_id', async (req, res) => {
    if (!req.session.user) return res.status(403).send('No autorizado');
    try {
        await pool.query(
            `INSERT INTO asignaciones (alumno_id, tarea_id, visto, completada) VALUES ($1, $2, TRUE, TRUE) 
             ON CONFLICT (alumno_id, tarea_id) DO UPDATE SET visto = TRUE, completada = TRUE`,
            [req.session.user.id, req.params.tarea_id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- BLOQUE: INTEGRACIÓN CON IA DE GEMINI (AJUSTADO) ---
app.post('/api/gemini', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).send('Prompt vacío');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // <-- Ajustado al modelo estable
        const result = await model.generateContent(`Eres un tutor experto en pedagogía de las matemáticas de nivel secundario/primario. Tu objetivo es guiar al estudiante paso a paso sin darle la solución directamente de entrada, usa un lenguaje motivante y claro. Pregunta del alumno: ${prompt}`);
        const response = await result.response;
        res.json({ respuesta: response.text() });
    } catch (err) {
        res.status(500).json({ error: 'Fallo al conectar con el servidor de IA de Google.' });
    }
});


// --- BLOQUE: COPIA DE SEGURIDAD ---
app.get('/api/sistema/respaldo', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos');
        const usuarios = await pool.query('SELECT * FROM usuarios WHERE rol = \'alumno\'');
        const tareas = await pool.query('SELECT * FROM tareas');
        const asignaciones = await pool.query('SELECT * FROM asignaciones');
        
        res.json({
            version: "2026.1",
            timestamp: new Date(),
            cursos: cursos.rows,
            usuarios: usuarios.rows,
            tareas: tareas.rows,
            asignaciones: asignaciones.rows
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sistema/restaurar', async (req, res) => {
    const { cursos, usuarios, tareas, asignaciones } = req.body;
    try {
        await pool.query('TRUNCATE asignaciones, tareas, usuarios, fechas_importantes, cursos RESTART IDENTITY CASCADE');
        
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[OK] Servidor corriendo en http://localhost:${PORT}`));
