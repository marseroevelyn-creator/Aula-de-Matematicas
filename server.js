const express = require('express');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(express.json());
// Servir la carpeta "public" donde va a estar el diseño visual
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------------------
// CONEXIÓN CON LA BASE DE DATOS (Neon PostgreSQL) [cite: 180]
// -------------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Se configura en la web de Render
  ssl: { rejectUnauthorized: false }
});

// -------------------------------------------------------------------------
// CONEXIÓN CON LA INTELIGENCIA ARTIFICIAL (Gemini AI) 
// -------------------------------------------------------------------------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "TU_CLAVE_AQUI");

// -------------------------------------------------------------------------
// BLOQUE DE AUTENTICACIÓN (LOGIN) [cite: 182]
// -------------------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
    try {
        const { id, contrasena, esDocente } = req.body;

        // Si intenta entrar la profesora, no buscamos en la base de datos (evita que falle si está vacía)
        if (esDocente) {
            if (contrasena === 'admin123') { // 
                return res.json({ success: true, esDocente: true });
            } else {
                return res.status(401).json({ success: false, error: "Contraseña docente incorrecta." });
            }
        }

        // Si intenta entrar un alumno, se busca su ID seleccionado en el buscador 
        if (!id) {
            return res.status(400).json({ success: false, error: "Por favor, elegí un alumno de la lista." });
        }

        const result = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "El alumno no existe." });
        }

        const alumno = result.rows[0];

        // Verificamos si la contraseña coincide 
        if (alumno.contrasena === contrasena) {
            // Si la contraseña sigue siendo "usuario", significa que es su primer ingreso 
            const primerIngreso = (contrasena === 'usuario');
            return res.json({ success: true, esDocente: false, primerIngreso: primerIngreso });
        } else {
            return res.status(401).json({ success: false, error: "Contraseña incorrecta." });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Error en el servidor." });
    }
});

// -------------------------------------------------------------------------
// BLOQUE DE TEXTO PREDICTIVO (Simula alumnos guardados en Neon) [cite: 327]
// -------------------------------------------------------------------------
app.get('/api/auth/buscar-alumnos', async (req, res) => {
    try {
        const queryTexto = req.query.q || '';
        // Buscamos coincidencias en la base de datos
        const result = await pool.query(
            "SELECT id, nombre, '1º Año A' as curso_nombre FROM alumnos WHERE nombre ILIKE $1 LIMIT 5",
            [`%${queryTexto}%`]
        );
        
        // SI LA BASE DE DATOS ESTÁ VACÍA: Mandamos un alumno de prueba para que puedas testear el sistema [cite: 259]
        if (result.rows.length === 0 && queryTexto.toLowerCase().startsWith('j')) {
            return res.json([{ id: 999, nombre: "Juan Pérez", curso_nombre: "1º Año A" }]);
        }
        
        res.json(result.rows);
    } catch (err) {
        // Respuesta de emergencia si la DB no está lista
        res.json([{ id: 999, nombre: "Juan Pérez", curso_nombre: "1º Año A" }]);
    }
});

// -------------------------------------------------------------------------
// BLOQUE DE CONSULTAS PEDAGÓGICAS A GEMINI (Real y activo) 
// -------------------------------------------------------------------------
app.post('/api/gemini/consultar', async (req, res) => {
    try {
        const { duda } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const sistemaPrompt = `Actúa como un profesor de matemática de secundaria muy buena onda y paciente. 
        Explicá de forma simple, usando ejemplos claros. Responde a la siguiente duda: ${duda}`;

        const result = await model.generateContent(sistemaPrompt);
        const response = await result.response;
        res.json({ respuesta: response.text() });
    } catch (error) {
        res.status(500).json({ respuesta: "Hola! Soy tu tutor IA. Para responder, asegurate de cargar tu GEMINI_API_KEY en las variables de Render." });
    }
});

// Simulacros de respuestas de datos para que la interfaz cargue contenido visual inicial [cite: 244, 250]
app.get('/api/docente/dashboard', (req, res) => {
    res.json({
        cursos: [{ id: 1, nombre: "1º Año A", fechas_importantes: "Prueba de Fracciones el viernes!" }], // [cite: 240, 244]
        alumnos: [{ id: 999, nombre: "Juan Pérez", curso_nombre: "1º Año A" }] // [cite: 247, 259]
    });
});

app.get('/api/alumno/dashboard', (req, res) => {
    res.json({
        curso: { nombre: "1º Año A", whatsapp_link: "https://whatsapp.com" }, // [cite: 189, 342]
        tareas: [
            { tarea_id: 101, tema: "Unidad 1: Fracciones", titulo: "#1. Conceptos básicos de Fracciones", tipo_recurso: "video", archivo_url: "#", completada: false }, // [cite: 217, 325, 350]
            { tarea_id: 102, tema: "Unidad 1: Inecuaciones", titulo: "#3. Introducción a Intervalos", tipo_recurso: "pdf", archivo_url: "#", completada: false } // [cite: 311, 317]
        ]
    });
});

app.post('/api/auth/primer-ingreso', (req, res) => res.json({ success: true }));
app.post('/api/alumno/completar-tarea', (req, res) => res.json({ success: true }));

// Arrancar el servidor en el puerto automático de Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
