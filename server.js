const express = require('express');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. CONEXIÓN CON NEON POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. CONEXIÓN CON GEMINI AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "SINEFECTO");

// =========================================================================
// BLOQUE DE AUTENTICACIÓN & LOGIN (Docente y Alumnos)
// =========================================================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { id, contrasena, esDocente } = req.body;

        // Validación directa de la profesora para evitar bloqueos
        if (esDocente) {
            if (contrasena === 'admin123') {
                return res.json({ success: true, esDocente: true });
            } else {
                return res.status(401).json({ success: false, error: "Contraseña docente incorrecta." });
            }
        }

        if (!id) return res.status(400).json({ success: false, error: "Falta seleccionar el alumno." });

        const result = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Alumno no encontrado." });

        const alumno = result.rows[0];
        if (alumno.contrasena === contrasena) {
            const primerIngreso = (contrasena === 'usuario');
            return res.json({ success: true, esDocente: false, primerIngreso });
        } else {
            return res.status(401).json({ success: false, error: "Contraseña incorrecta." });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Error interno de autenticación." });
    }
});

// Texto predictivo para buscar alumnos en la base de datos
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

app.post('/api/auth/primer-ingreso', async (req, res) => {
    try {
        const { alumnoId, nuevaClave } = req.body;
        await pool.query('UPDATE alumnos SET contrasena = $1 WHERE id = $2', [nuevaClave, alumnoId]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false });
    }
});

// =========================================================================
// GESTIÓN DE CURSOS (Crear, Editar nombre, Link WhatsApp, Eliminar)
// =========================================================================
app.get('/api/docente/dashboard', async (req, res) => {
    try {
        const cursos = await pool.query('SELECT * FROM cursos ORDER BY nombre ASC');
        const alumnos = await pool.query(`
            SELECT a.id, a.nombre, a.curso_id, c.nombre as curso_nombre 
            FROM alumnos a 
            LEFT JOIN cursos c ON a.curso_id = c.id 
            ORDER BY a.nombre ASC`);
        const tareas = await pool.query('SELECT * FROM banco_tareas ORDER BY id DESC');
        const asignadas = await pool.query('SELECT * FROM tareas_asignadas');

        res.json({ 
            cursos: cursos.rows, 
            alumnos: alumnos.rows, 
            bancoTareas: tareas.rows,
            tareasAsignadas: asignadas.rows 
        });
    } catch {
        res.json({ cursos: [], alumnos: [], bancoTareas: [], tareasAsignadas: [] });
    }
});

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
        await pool.query('UPDATE cursos SET nombre = $1 WHERE id = $2', [nombre], id);
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

// =========================================================================
// GESTIÓN DE ALUMNOS (Añadir, Reiniciar Clave, Adecuación Curricular)
// =========================================================================
app.post('/api/alumnos/añadir', async (req, res) => {
    try {
        const { nombre, cursoId } = req.body;
        await pool.query('INSERT INTO alumnos (nombre, curso_id, contrasena) VALUES ($1, $2, \'usuario\')', [nombre, cursoId]);
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
