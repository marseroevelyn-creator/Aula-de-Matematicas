/**
 * SERVIDOR CENTRAL - AULA VIRTUAL DE MATEMÁTICAS (PRODUCCIÓN)
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

// --- CONFIGURACIÓN DE MIDDLEWARES GLOBALES ---
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto_seguro_matematica_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// --- CONEXIÓN ÚNICA Y GLOBAL A NEON ---
const urlConexion = process.env.DATABASE_URL;
if (!urlConexion) {
    console.error("❌ CRÍTICO: La variable DATABASE_URL no está configurada.");
} else {
    console.log("📌 Conectando de forma exclusiva a Neon...");
}

const pool = new Pool({
    connectionString: urlConexion,
    ssl: { rejectUnauthorized: false }
});

// --- CONFIGURACIÓN DE CLOUDINARY ---
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

// --- CONFIGURACIÓN DE IA GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "MOCK_KEY");

// --- INICIALIZACIÓN DE TABLAS ---
async function initDB() {
    try {
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
        console.log("-> Estructura en Neon verificada correctamente.");
    } catch (err) {
        console.error("❌ Error inicializando tablas:", err.message);
    }
}
initDB();

// --- RUTAS DE AUTENTICACIÓN ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
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
                return res.json({ success: true, rol: 'alumno', debeCambiar: user.debe_cambiar_clave });
            }
        }
        res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTA EXCLUSIVA DE RESTAURACIÓN DE DATOS ---
app.post('/api/sistema/restaurar', async (req, res) => {
    try {
        const cursosInput = req.body.cursos || [];
        const alumnosInput = req.body.usuarios || req.body.alumnos || [];
        const recursosInput = req.body.tareas || req.body.recursos || [];

        await pool.query('TRUNCATE asignaciones, tareas, usuarios, fechas_importantes, cursos RESTART IDENTITY CASCADE');
        const limpiarTexto = (t) => t ? t.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : "";

        for (let c of cursosInput) {
            if (!c.nombre) continue;
            const whatsapp = c.whatsapp_link !== undefined ? c.whatsapp_link : (c.link_whatsapp || "");
            await pool.query('INSERT INTO cursos (nombre, whatsapp_link) VALUES ($1, $2)', [c.nombre.trim(), whatsapp.trim()]);
        }

        const cursosDb = await pool.query('SELECT id, nombre FROM cursos');
        const mapaCursos = {};
        cursosDb.rows.forEach(row => { mapaCursos[limpiarTexto(row.nombre)] = row.id; });

        for (let u of alumnosInput) {
            const nombreUsuario = u.username || u.nombre;
            if (!nombreUsuario) continue;
            const passwordUsuario = u.password || u.contrasena || "usuario";
            const cursoOriginal = u.curso || "";
            const cursoId = mapaCursos[limpiarTexto(cursoOriginal)] || null;
            const debeCambiar = u.debe_cambiar_clave !== undefined ? u.debe_cambiar_clave : (u.primer_ingreso == 1);

            await pool.query(
                'INSERT INTO usuarios (username, password, rol, curso_id, debe_cambiar_clave) VALUES ($1, $2, \'alumno\', $3, $4)', 
                [nombreUsuario.trim(), passwordUsuario.toString().trim(), cursoId, debeCambiar]
            );
        }

        for (let r of recursosInput) {
            const titulo = r.titulo || "Tarea sin título";
            const descripcion = r.descripcion || "";
            const carpeta = r.tema || "General";
            const archivoUrl = r.archivo_url || r.archivo_tarea_url || null;
            const requiereEntrega = r.requiere_entrega == 1 || r.requiere_entrega === true;

            await pool.query(
                'INSERT INTO tareas (titulo, descripcion, carpeta, archivo_url, requiere_entrega) VALUES ($1, $2, $3, $4, $5)',
                [titulo.trim(), descripcion.trim(), carpeta.trim(), archivoUrl ? archivoUrl.trim() : null, requiereEntrega]
            );
        }

        return res.json({ success: true });
    } catch (err) {
        console.error("Error en restauración:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// --- ENTORNO DE ESCUCHA (RENDER) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running and listening on port ${PORT}`);
});
