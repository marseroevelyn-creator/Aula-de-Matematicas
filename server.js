const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();

// Inicializar Gemini con la clave de entorno de Render
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());
app.use(express.static('public'));

// Endpoint interactivo real solicitado para los alumnos
app.post('/api/gemini/consultar', async (req, res) => {
    try {
        const { duda } = req.body;
        if (!duda) return res.status(400).json({ error: "La duda está vacía." });

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Contexto adaptado para tus alumnos de matemática
        const promptSystem = `Actúa como un tutor de matemáticas empático y claro para secundaria. 
        Responde de forma breve y estructurada a la siguiente consulta del alumno: ${duda}`;

        const result = await model.generateContent(promptSystem);
        const response = await result.response;
        
        res.json({ respuesta: response.text() });
    } catch (error) {
        console.error("Error en Gemini AI:", error);
        res.status(500).json({ error: "Error al procesar la consulta con la IA." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
