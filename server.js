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
        folder: 'aula_matematica',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'docx']
    }
});
const upload = multer({ storage : storage });

// Inicializar el SDK de Gemini IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// =========================================================================
// 🔑 ENDPOINTS DE AUTENTICACIÓN (LOGIN, CLAVE Y LOGOUT)
// =========================================================================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
        if (resultado.rows.length === 0) {
            return res.json({ success: false, message: 'Usuario no registrado.' });
        }
        
        const usuario = resultado.rows[0];
        if (usuario.password !== password) {
            return res.json({ success: false, message: 'Contraseña incorrecta.' });
        }

        req.session.usuarioId = usuario.id;
        req.session.rol = usuario.rol;
        req.session.username = usuario.username;
        req.session.cursoId = usuario.curso_id;

        res.json({ 
            success: true, 
            rol: usuario.rol, 
            debeCambiar: usuario.debe_cambiar_clave 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/cambiar-clave', async (req, res) => {
    if (!req.session.usuarioId) return res.status(401).json({ error: 'No autorizado' });
    const { nuevaClave } = req.body;
    try {
        await pool.query(
            'UPDATE usuarios SET password = $1, debe_cambiar_clave = false WHERE id = $2',
            [nuevaClave, req.session.usuarioId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 📂 ENDPOINTS DE CURSOS (OBTENER, CREAR, EDITAR, ELIMINAR)
// =========================================================================
app.get('/api/cursos', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM cursos ORDER BY nombre ASC');
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cursos', async (req, res) => {
    const { nombre, whatsapp_link } = req.body;
    try {
        const nuevo = await pool.query(
            'INSERT INTO cursos (nombre, whatsapp_link) VALUES ($1, $2) RETURNING *',
            [nombre, whatsapp_link]
        );
        res.json(nuevo.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/cursos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, whatsapp_link } = req.body;
    try {
        const modificado = await pool.query(
            'UPDATE cursos SET nombre = $1, whatsapp_link = $2 WHERE id = $3 RETURNING *',
            [nombre, whatsapp_link, id]
        );
        res.json(modificado.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/cursos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM cursos WHERE id = $1', [id]);
        res.json({ success: true, message: 'Curso eliminado.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cursos/:id/tareas', async (req, res) => {
    const { id } = req.params;
    try {
        const resultado = await pool.query(`
            SELECT t.*, pt.titulo AS prerrequisito_titulo 
            FROM curso_tareas ct
            JOIN tareas t ON ct.tarea_id = t.id
            LEFT JOIN tareas pt ON t.prerrequisito_id = pt.id
            WHERE ct.curso_id = $1
            ORDER BY t.id ASC
        `, [id]);
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// 👥 ENDPOINTS DE GESTIÓN DE USUARIOS / ALUMNOS
// =========================================================================
app.get('/api/usuarios', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT id, username, rol, curso_id FROM usuarios ORDER BY username ASC');
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/usuarios', async (req, res) => {
    let { username, password, rol, curso_id } = req.body;
    try {
        if (!username || username.trim() === "") {
            return res.status(400).json({ success: false, error: "El nombre es obligatorio." });
        }

        let idCurso = null;
        if (curso_id && curso_id !== "null" && curso_id !== "") {
            idCurso = parseInt(curso_id);
        }

        const nuevoUsuario = await pool.query(
            `INSERT INTO usuarios (username, password, rol, curso_id, debe_cambiar_clave) 
             VALUES ($1, $2, $3, $4, true) RETURNING id, username`,
            [username.trim(), password || 'usuario', rol || 'alumno', idCurso]
        );

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
        res.status(500).json({ success: false, error: err.message });
    }
});

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
            return res.status(404).json({ success: false, error: "El alumno no existe." });
        }

        res.json({ success: true, message: "Datos actualizados.", alumno: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        res.json({ success: true, message: "Estudiante dado de baja correctamente." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cursos/:id/alumnos-progreso', async (req, res) => {
    const { id } = req.params;
    try {
        const resultado = await pool.query(`
            SELECT u.id, u.username,
            COALESCE(
                ROUND(
                    (COUNT(CASE WHEN a.completada = true THEN 1 END)::numeric / 
                    NULLIF(COUNT(a.id), 0)::numeric) * 100
                ), 0
            ) AS progreso
            FROM usuarios u
            LEFT JOIN asignaciones a ON u.id = a.alumno_id AND a.excluido = false
            WHERE u.curso_id = $1 AND u.rol = 'alumno'
            GROUP BY u.id, u.username
            ORDER BY u.username ASC
        `, [id]);
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// 📝 ENDPOINTS DEL REPOSITORIO GLOBAL DE TAREAS (BANCO DE TAREAS)
// =========================================================================
app.get('/api/tareas', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM tareas ORDER BY id DESC');
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tareas', upload.single('archivo'), async (req, res) => {
    const { titulo, descripcion, carpeta, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id } = req.body;
    const archivo_url = req.file ? req.file.path : null;
    const preId = (prerrequisito_id === 'null' || !prerrequisito_id) ? null : parseInt(prerrequisito_id);
    const reqEntrega = requiere_entrega === 'true';

    try {
        const nueva = await pool.query(
            `INSERT INTO tareas (titulo, descripcion, carpeta, enlace_externo, archivo_url, requiere_entrega, fecha_entrega, prerrequisito_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [titulo, descripcion, carpeta, enlace_externo, archivo_url, reqEntrega, fecha_entrega || null, preId]
        );
        res.json(nueva.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tareas/:id', upload.single('archivo'), async (req, res) => {
    const { id } = req.params;
    const { titulo, descripcion, carpeta, enlace_externo, requiere_entrega, fecha_entrega, prerrequisito_id } = req.body;
    const preId = (prerrequisito_id === 'null' || !prerrequisito_id) ? null : parseInt(prerrequisito_id);
    const reqEntrega = requiere_entrega === 'true';

    try {
        let consulta = `UPDATE tareas SET titulo=$1, descripcion=$2, carpeta=$3, enlace_externo=$4, requiere_entrega=$5, fecha_entrega=$6, prerrequisito_id=$7`;
        let params = [titulo, descripcion, carpeta, enlace_externo, reqEntrega, fecha_entrega || null, preId];

        if (req.file) {
            consulta += `, archivo_url=$8 WHERE id=$9 RETURNING *`;
            params.push(req.file.path, id);
        } else {
            consulta += ` WHERE id=$8 RETURNING *`;
            params.push(id);
        }

        const modificada = await pool.query(consulta, params);
        res.json(modificada.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tareas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM tareas WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// 🎯 ASIGNACIONES GRUPALES E INDIVIDUALES
// =========================================================================
app.post('/api/asignaciones/asignar-grupo', async (req, res) => {
    const { curso_id, tarea_id } = req.body;
    try {
        await pool.query('INSERT INTO curso_tareas (curso_id, tarea_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [curso_id, tarea_id]);
        const alumnos = await pool.query('SELECT id FROM usuarios WHERE curso_id = $1 AND rol = \'alumno\'', [curso_id]);
        
        for (let alu of alumnos.rows) {
            await pool.query(
                `INSERT INTO asignaciones (alumno_id, tarea_id, excluido, entregado, completada, visto)
                 VALUES ($1, $2, false, false, false, false) ON CONFLICT DO NOTHING`,
                [alu.id, tarea_id]
            );
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/asignaciones/curso/:cursoId/tarea/:tareaId', async (req, res) => {
    const { cursoId, tareaId } = req.params;
    try {
        await pool.query('DELETE FROM curso_tareas WHERE curso_id = $1 AND tarea_id = $2', [cursoId, tareaId]);
        await pool.query(`
            DELETE FROM asignaciones 
            WHERE tarea_id = $1 AND alumno_id IN (SELECT id FROM usuarios WHERE curso_id = $2)
        `, [tareaId, cursoId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/individual', async (req, res) => {
    const { alumno_id, tarea_id, estado } = req.body;
    try {
        const aluId = parseInt(alumno_id);
        const tarId = parseInt(tarea_id);

        if (isNaN(aluId) || isNaN(tarId)) {
            return res.status(400).json({ success: false, error: "IDs inválidos." });
        }

        if (estado === 'excluir') {
            await pool.query(
                `INSERT INTO asignaciones (alumno_id, tarea_id, excluido, entregado, completada, visto) 
                 VALUES ($1, $2, true, false, false, false) 
                 ON CONFLICT (alumno_id, tarea_id) 
                 DO UPDATE SET excluido = true`,
                [aluId, tarId]
            );
            return res.json({ success: true, message: "Actividad excluida." });
        
        } else if (estado === 'asignar') {
            await pool.query(
                `INSERT INTO asignaciones (alumno_id, tarea_id, excluido, entregado, completada, visto) 
                 VALUES ($1, $2, false, false, false, false) 
                 ON CONFLICT (alumno_id, tarea_id) 
                 DO UPDATE SET excluido = false`,
                [aluId, tarId]
            );
            return res.json({ success: true, message: "Actividad asignada." });
        
        } else if (estado === 'eliminar') {
            await pool.query('DELETE FROM asignaciones WHERE alumno_id = $1 AND tarea_id = $2', [aluId, tarId]);
            return res.json({ success: true, message: "Regla individual eliminada." });
        }

        res.status(400).json({ success: false, error: "Acción inválida." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- REVISIÓN Y CORRECCIÓN POR LA PROFESORA ---
app.get('/api/asignaciones/tarea/:id/entregas', async (req, res) => {
    const { id } = req.params;
    try {
        const resultado = await pool.query(`
            SELECT a.*, u.username AS alumno_nombre
            FROM asignaciones a
            JOIN usuarios u ON a.alumno_id = u.id
            WHERE a.tarea_id = $1 AND a.excluido = false AND (a.visto = true OR a.entregado = true)
            ORDER BY u.username ASC
        `, [id]);
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/:id/corregir', async (req, res) => {
    const { id } = req.params;
    const { devolucion, completada } = req.body;
    try {
        await pool.query(
            'UPDATE asignaciones SET devolucion = $1, completada = $2 WHERE id = $3',
            [devolucion, completada, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/:id/reasignar', async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;
    try {
        await pool.query(
            `UPDATE asignaciones 
             SET devolucion = $1, completada = false, entregado = false, visto = false, archivo_entrega_url = NULL 
             WHERE id = $2`,
            [motivo, id]
        );
        res.json({ success: true, message: "Tarea reasignada con éxito." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// 🎓 FEED Y ENVIOS DEL ESTUDIANTE
// =========================================================================
app.get('/api/alumno/dashboard', async (req, res) => {
    if (!req.session.usuarioId) return res.status(401).json({ error: 'No autenticado' });
    try {
        const datosCurso = await pool.query('SELECT nombre, whatsapp_link FROM cursos WHERE id = $1', [req.session.cursoId]);
        const cursoInfo = datosCurso.rows[0] || { nombre: 'Sin Curso Asignado', whatsapp_link: null };

        const tareas = await pool.query(`
            SELECT t.id AS tarea_id, t.titulo, t.descripcion, t.carpeta, t.enlace_externo, t.archivo_url, t.requiere_entrega, t.prerrequisito_id,
                   a.id AS asignacion_id, a.completada, a.visto, a.devolucion,
                   COALESCE(
                       (SELECT completada FROM asignaciones WHERE alumno_id = $1 AND tarea_id = t.prerrequisito_id), 
                       false
                   ) AS prerrequisito_completado
            FROM asignaciones a
            JOIN tareas t ON a.tarea_id = t.id
            WHERE a.alumno_id = $1 AND a.excluido = false
            ORDER BY t.id ASC
        `, [req.session.usuarioId]);

        res.json({
            usuario: req.session.username,
            curso: cursoInfo,
            tareas: tareas.rows
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/:id/entregar', upload.single('archivo'), async (req, res) => {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Falta adjuntar el archivo' });
    try {
        await pool.query(
            'UPDATE asignaciones SET archivo_entrega_url = $1, entregado = true, visto = true WHERE id = $2',
            [req.file.path, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/asignaciones/:id/visto', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE asignaciones SET visto = true, completada = true WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// 🤖 INTERACCIÓN CON EL TUTOR IA DE MATEMÁTICAS (GEMINI)
// =========================================================================
app.post('/api/gemini', async (req, res) => {
    const { prompt } = req.body;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const instruccionRol = "Eres un tutor de matemáticas especializado en nivel secundario. Tu tono debe ser paciente, pedagógico y motivacional. Ayuda al alumno guiándolo paso a paso sin darle la respuesta de forma directa e inmediata, para fomentar el razonamiento autónomo.";
        
        const resultado = await model.generateContent([instruccionRol, prompt]);
        const respuestaTexto = resultado.response.text();
        res.json({ respuesta: respuestaTexto });
    } catch (err) {
        console.error("Fallo al consultar con Gemini IA:", err);
        res.json({ respuesta: "Hola, en este momento el Tutor IA se encuentra procesando otras consultas. Intentá de nuevo en unos momentos." });
    }
});

// =========================================================================
// 📅 CRONOGRAMA DE FECHAS IMPORTANTES
// =========================================================================
app.get('/api/fechas', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM fechas ORDER BY fecha ASC');
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/fechas', async (req, res) => {
    const { fecha, evento } = req.body;
    try {
        const nueva = await pool.query('INSERT INTO fechas (fecha, evento) VALUES ($1, $2) RETURNING *', [fecha, evento]);
        res.json(nueva.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/fechas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM fechas WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// 💾 RESPALDO DEL SISTEMA COMPLETO (RESTAURACIÓN CENTRAL)
// =========================================================================
app.post('/api/sistema/restaurar', async (req, res) => {
    const { usuarios, cursos, tareas, curso_tareas, asignaciones, fechas } = req.body;
    try {
        await pool.query('TRUNCATE asignaciones, curso_tareas, tareas, usuarios, cursos, fechas RESTART IDENTITY CASCADE');
        
        if(cursos) {
            for (let c of cursos) await pool.query('INSERT INTO cursos (id, nombre, whatsapp_link) VALUES ($1, $2, $3)', [c.id, c.nombre, c.whatsapp_link]);
        }
        if(usuarios) {
            for (let u of usuarios) await pool.query('INSERT INTO usuarios (id, username, password, rol, curso_id, debe_cambiar_clave) VALUES ($1, $2, $3, $4, $5, $6)', [u.id, u.username, u.password, u.rol, u.curso_id, u.debe_cambiar_clave]);
        }
        if(tareas) {
            for (let t of tareas) await pool.query('INSERT INTO tareas (id, titulo, descripcion, carpeta, enlace_externo, archivo_url, requiere_entrega, fecha_entrega, prerrequisito_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [t.id, t.titulo, t.descripcion, t.carpeta, t.enlace_externo, t.archivo_url, t.requiere_entrega, t.fecha_entrega, t.prerrequisito_id]);
        }
        if(curso_tareas) {
            for (let ct of curso_tareas) await pool.query('INSERT INTO curso_tareas (curso_id, tarea_id) VALUES ($1, $2)', [ct.curso_id, ct.tarea_id]);
        }
        if(fechas) {
            for (let f of fechas) await pool.query('INSERT INTO fechas (id, fecha, evento) VALUES ($1, $2, $3)', [f.id, f.fecha, f.evento]);
        }
        if(asignaciones) {
            for (let a of asignaciones) await pool.query('INSERT INTO asignaciones (id, alumno_id, tarea_id, excluido, entregado, archivo_entrega_url, devolucion, completada, visto) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [a.id, a.alumno_id, a.tarea_id, a.excluido, a.entregado, a.archivo_entrega_url, a.devolucion, a.completada, a.visto]);
        }
        res.json({ success: true, message: "Base de datos restaurada con éxito total." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PUERTO DE ARRANQUE ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor activo y corriendo en el puerto ${PORT}`);
});
