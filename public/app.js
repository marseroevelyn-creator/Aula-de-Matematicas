/**
 * =========================================================================
 * ESTADO GLOBAL DE LA APLICACIÓN (SPA)
 * =========================================================================
 */
let alumnoSeleccionadoId = null;
let cursoActualDocenteId = null;

// Escuchador principal al cargar el árbol DOM
document.addEventListener('DOMContentLoaded', () => {
    // Inicialización de íconos vectoriales Lucide
    if (window.lucide) lucide.createIcons();
    
    // Configuración del buscador interactivo para el ingreso de alumnos
    initBuscadorPredictivo();
    
    // Vinculación de eventos de envío a los formularios mutables
    initFormularios();
});

/**
 * =========================================================================
 * ENRUTADOR DE VISTAS (Manejo de capas ocultas/visibles de interfaz)
 * =========================================================================
 */
function switchView(viewId) {
    const vistas = ['view-login', 'view-login-docente', 'view-primer-ingreso', 'view-docente', 'view-alumno'];
    vistas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const vistaActiva = document.getElementById(viewId);
    if (vistaActiva) vistaActiva.classList.remove('hidden');
    
    // Forzar re-renderizado de iconos visuales en la nueva capa activa
    if (window.lucide) lucide.createIcons();
}

// Función auxiliar para el "ojo" de las contraseñas
function togglePassword(id) {
    const el = document.getElementById(id);
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

/**
 * =========================================================================
 * CONTROL DE ACCESO & BUSCADOR PREDICTIVO (PANTALLA DE INICIO)
 * =========================================================================
 */
function initBuscadorPredictivo() {
    const input = document.getElementById('login-nombre');
    const box = document.getElementById('predictivo-box');
    if (!input || !box) return;

    // Bloque que captura el tipeo y despliega coincidencias dinámicas desde Neon DB
    input.addEventListener('input', async () => {
        const valor = input.value.trim();
        if (valor.length < 1) {
            box.classList.add('hidden');
            alumnoSeleccionadoId = null;
            return;
        }

        try {
            const res = await fetch(`/api/auth/buscar-alumnos?q=${encodeURIComponent(valor)}`);
            const alumnos = await res.json();

            if (alumnos.length > 0) {
                box.innerHTML = '';
                box.classList.remove('hidden');
                alumnos.forEach(alumno => {
                    const div = document.createElement('div');
                    div.className = "px-4 py-2 hover:bg-blue-50 cursor-pointer text-xs font-medium text-slate-700 transition border-b border-slate-50 last:border-none";
                    div.innerText = `${alumno.nombre} (${alumno.curso_nombre})`;
                    
                    // Al seleccionar, se asienta el ID interno y se autocompleta el input
                    div.addEventListener('click', () => {
                        input.value = alumno.nombre;
                        alumnoSeleccionadoId = alumno.id;
                        box.classList.add('hidden');
                    });
                    box.appendChild(div);
                });
            } else {
                box.classList.add('hidden');
                alumnoSeleccionadoId = null;
            }
        } catch (err) {
            console.error("Error consultando buscador predictivo:", err);
        }
    });
}

function initFormularios() {
    // Manejo de envío de login de alumnos
    document.getElementById('form-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contrasena = document.getElementById('login-clave').value;

        if (!alumnoSeleccionadoId) {
            alert("Por favor, escribí y seleccioná tu nombre completo de la lista predictiva.");
            return;
        }

        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: alumnoSeleccionadoId, contrasena, esDocente: false })
        });
        const data = await res.json();

        if (res.ok) {
            if (data.primerIngreso) {
                switchView('view-primer-ingreso');
            } else {
                switchView('view-alumno');
                cargarAlumnoWorkspace();
            }
        } else {
            alert(data.error || "Clave incorrecta.");
        }
    });

    // Manejo de ingreso del panel de la profesora
    document.getElementById('form-login-docente')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contrasena = document.getElementById('docente-clave').value;

        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contrasena, esDocente: true })
        });

        if (res.ok) {
            switchView('view-docente');
            cargarDocenteDashboard();
        } else {
            alert("Contraseña docente inválida.");
        }
    });

    // Cambio obligatorio de clave por primera vez (mínimo 4 dígitos)
    document.getElementById('form-primer-ingreso')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nuevaClave = document.getElementById('nueva-clave').value;

        if(nuevaClave.length < 4) {
            alert("La clave debe tener al menos 4 dígitos.");
            return;
        }

        const res = await fetch('/api/auth/primer-ingreso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevaClave, alumnoId: alumnoSeleccionadoId })
        });

        if (res.ok) {
            alert("¡Contraseña actualizada con éxito!");
            switchView('view-alumno');
            cargarAlumnoWorkspace();
        } else {
            alert("Error al intentar guardar la clave.");
        }
    });
}

/**
 * =========================================================================
 * ENTORNO DEL ESTUDIANTE & CONSULTAS A GEMINI AI
 * =========================================================================
 */
async function cargarAlumnoWorkspace() {
    try {
        const res = await fetch('/api/alumno/dashboard');
        if (!res.ok) return;
        const data = await res.json();

        // Actualización dinámica del encabezado del alumno
        const subId = document.getElementById('header-alumno-subtitulo');
        if (subId && data.curso) {
            let whatsappHtml = data.curso.whatsapp_link 
                ? ` | <a href="${data.curso.whatsapp_link}" target="_blank" class="underline text-emerald-400 font-bold inline-flex items-center gap-1"><i data-lucide="phone" class="w-3 h-3"></i> WhatsApp Grupo</a>`
                : '';
            subId.innerHTML = `Curso: <span class="font-bold">${data.curso.nombre}</span>${whatsappHtml}`;
        }

        // Renderizado del Índice de Temas Lateral Requerido
        const contIndice = document.getElementById('alumno-indice-temas');
        const contActividades = document.getElementById('alumno-actividades-box');
        if (contIndice) contIndice.innerHTML = '';
        if (contActividades) contActividades.innerHTML = '';

        const temasDetectados = new Set();

        if (data.tareas && data.tareas.length > 0) {
            data.tareas.forEach(tarea => {
                temasDetectados.add(tarea.tema);

                const card = document.createElement('div');
                card.className = `p-4 rounded-xl border mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                    tarea.completada ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-blue-100 shadow-sm'
                }`;

                // Bloque condicional: Envía alerta de auriculares si la tarea asignada es un video educativo
                const eventoClick = tarea.tipo_recurso === 'video'
                    ? `onclick="alert('🎧 Recordá usar auriculares si estás adentro del salón de clases.'); marcarActividadHecha(${tarea.tarea_id}, true);"`
                    : `onclick="marcarActividadHecha(${tarea.tarea_id}, false);"`;

                let botonAccion = tarea.completada
                    ? `<span class="text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-bold">✓ Entregado</span>`
                    : `<button ${eventoClick} class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition">Marcar como Hecha</button>`;

                // Enlaces dinámicos a Cloudinary o Drive según el material de la profesora
                let linkAdjunto = '';
                if (tarea.archivo_url) {
                    linkAdjunto = `<a href="${tarea.archivo_url}" target="_blank" class="text-blue-600 font-bold hover:underline text-xs block mt-1"><i data-lucide="file" class="w-3 h-3 inline"></i> Ver Material</a>`;
                }

                card.innerHTML = `
                    <div>
                        <span class="text-[10px] bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-500 uppercase">${tarea.tema}</span>
                        <h4 class="font-bold text-slate-800 text-sm mt-1">${tarea.titulo}</h4>
                        ${linkAdjunto}
                    </div>
                    <div>${botonAccion}</div>
                `;
                contActividades?.appendChild(card);
            });
        }

        // Construcción interactiva del índice por bloques de tema
        temasDetectados.forEach(tema => {
            if (contIndice) {
                contIndice.innerHTML += `<a href="#" class="block px-2 py-1 text-xs text-slate-600 hover:text-blue-600 transition font-medium">${tema}</a>`;
            }
        });

        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error("Error montando espacio de alumno:", err);
    }
}

async function marcarActividadHecha(tareaId, fueVideo) {
    await fetch('/api/alumno/completar-tarea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarea_id: tareaId, visto: fueVideo })
    });
    cargarAlumnoWorkspace();
}

// Bloque que comunica las dudas matemáticas con la API real de Gemini en Express
async function consultarIA() {
    const input = document.getElementById('input-gemini');
    const respuestaBox = document.getElementById('respuesta-gemini');
    if (!input || !respuestaBox) return;

    const duda = input.value.trim();
    if (!duda) return;

    respuestaBox.classList.remove('hidden');
    respuestaBox.innerHTML = `<p class="text-xs text-blue-600 italic">Escribiendo respuesta pedagógica...</p>`;

    try {
        const res = await fetch('/api/gemini/consultar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duda })
        });
        const data = await res.json();
        respuestaBox.innerText = data.respuesta || "No se pudo obtener respuesta.";
    } catch {
        respuestaBox.innerText = "Error en el servidor al intentar conectar con el Tutor IA.";
    }
    input.value = '';
}

/**
 * =========================================================================
 * ENTORNO ADMINISTRATIVO (PANEL DE CONTROL DOCENTE)
 * =========================================================================
 */
async function cargarDocenteDashboard() {
    try {
        const res = await fetch('/api/docente/dashboard');
        if (!res.ok) return;
        const data = await res.json();

        // Renderizador de listado de cursos asignados
        const contCursos = document.getElementById('lista-cursos');
        if (contCursos) {
            contCursos.innerHTML = '';
            data.cursos.forEach(curso => {
                contCursos.innerHTML += `
                    <button onclick="seleccionarCursoDocente(${curso.id}, '${curso.nombre}')" class="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 font-bold rounded-lg text-xs hover:bg-blue-100 transition">
                        ${curso.nombre}
                    </button>
                `;
            });
        }

        // Renderizador de alumnos registrados en Neon PostgreSQL
        const tablaAlumnos = document.getElementById('tabla-alumnos');
        if (tablaAlumnos) {
            tablaAlumnos.innerHTML = '';
            data.alumnos.forEach(al => {
                tablaAlumnos.innerHTML += `
                    <tr class="border-b border-slate-100 text-xs">
                        <td class="py-2.5 font-medium text-slate-800">${al.nombre}</td>
                        <td class="py-2.5 text-right">
                            <button onclick="reiniciarClaveAlumno(${al.id}, '${al.nombre}')" class="text-blue-600 font-semibold hover:underline bg-slate-50 px-2 py-1 rounded">Reiniciar Clave</button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        console.error("Error al cargar el panel docente:", err);
    }
}

async function reiniciarClaveAlumno(id, nombre) {
    if (confirm(`¿Querés restaurar la clave de "${nombre}" a la contraseña inicial "usuario"?`)) {
        const res = await fetch(`/api/alumnos/${id}/reiniciar`, { method: 'POST' });
        if (res.ok) alert("Contraseña reestablecida correctamente.");
    }
}

// Bloque de resguardo de datos: Genera y descarga un volcado JSON completo de seguridad
function exportarBackup() {
    window.open('/api/docente/backup/exportar', '_blank');
}

// Desconexión segura de la aplicación (Limpieza de memoria del cliente)
function logout() {
    alumnoSeleccionadoId = null;
    cursoActualDocenteId = null;
    switchView('view-login');
}
