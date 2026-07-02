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
    
    // Cerrar el buscador si se hace click afuera
    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== box) {
            box.classList.add('hidden');
        }
    });
}

function initFormularios() {
    // FORMULARIO: LOGIN ALUMNOS
    document.getElementById('form-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contrasena = document.getElementById('login-clave').value;
        const nombreInput = document.getElementById('login-nombre').value;

        if (!alumnoSeleccionadoId) {
            alert("Por favor, escribí tu nombre y selecciónalo de la lista desplegable.");
            return;
        }

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: alumnoSeleccionadoId, 
                    nombre: nombreInput, 
                    contrasena: contrasena, 
                    esDocente: false 
                })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                if (data.primerIngreso) {
                    switchView('view-primer-ingreso');
                } else {
                    switchView('view-alumno');
                    cargarAlumnoWorkspace();
                }
            } else {
                alert(data.error || "Datos de ingreso incorrectos.");
            }
        } catch (err) {
            alert("Error de conexión con el servidor.");
        }
    });

    // FORMULARIO: LOGIN DOCENTE
    document.getElementById('form-login-docente')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contrasena = document.getElementById('docente-clave').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contrasena, esDocente: true })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                switchView('view-docente');
                cargarDocenteDashboard();
            } else {
                alert(data.error || "Contraseña docente incorrecta.");
            }
        } catch (err) {
            alert("Error al conectar con el panel de administración.");
        }
    });

    // FORMULARIO: PRIMER INGRESO (CAMBIO DE CLAVE)
    document.getElementById('form-primer-ingreso')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nuevaClave = document.getElementById('nueva-clave').value;

        if (nuevaClave.length < 4) {
            alert("La clave debe tener al menos 4 dígitos.");
            return;
        }

        try {
            const res = await fetch('/api/auth/primer-ingreso', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevaClave })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                alert("¡Contraseña actualizada con éxito!");
                switchView('view-alumno');
                cargarAlumnoWorkspace();
            } else {
                alert(data.error || "Error al intentar registrar tu nueva clave.");
            }
        } catch (err) {
            alert("Error de red al procesar el cambio de clave.");
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

        const subId = document.getElementById('header-alumno-subtitulo');
        if (subId && data.curso) {
            let whatsappHtml = data.curso.whatsapp_link 
                ? ` | <a href="${data.curso.whatsapp_link}" target="_blank" class="underline text-emerald-400 font-bold inline-flex items-center gap-1"><i data-lucide="phone" class="w-3 h-3"></i> WhatsApp Grupo</a>`
                : '';
            subId.innerHTML = `Curso: <span class="font-bold">${data.curso.nombre}</span>${whatsappHtml}`;
        }

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

                const eventoClick = tarea.tipo_recurso === 'video'
                    ? `onclick="alert('🎧 Recordá usar auriculares si estás adentro del salón de clases.'); marcarActividadHecha(${tarea.tarea_id}, true);"`
                    : `onclick="marcarActividadHecha(${tarea.tarea_id}, false);"`;

                let botonAccion = tarea.completada
                    ? `<span class="text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-bold">✓ Entregado</span>`
                    : `<button ${eventoClick} class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition">Marcar como Hecha</button>`;

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
        } else {
            if (contActividades) contActividades.innerHTML = `<p class="text-xs text-slate-400 italic text-center p-4">No hay actividades asignadas todavía.</p>`;
        }

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

        const contCursos = document.getElementById('lista-cursos');
        if (contCursos) {
            contCursos.innerHTML = '';
            if(data.cursos && data.cursos.length > 0) {
                data.cursos.forEach(curso => {
                    contCursos.innerHTML += `
                        <button onclick="seleccionarCursoDocente(${curso.id}, '${curso.nombre}', '${curso.fechas_importantes || ''}')" class="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 font-bold rounded-lg text-xs hover:bg-blue-100 transition">
                            ${curso.nombre}
                        </button>
                    `;
                });
            } else {
                contCursos.innerHTML = `<p class="text-xs text-slate-400 italic">No creaste cursos aún.</p>`;
            }
        }

        const tablaAlumnos = document.getElementById('tabla-alumnos');
        if (tablaAlumnos) {
            tablaAlumnos.innerHTML = '';
            if(data.alumnos && data.alumnos.length > 0) {
                data.alumnos.forEach(al => {
                    tablaAlumnos.innerHTML += `
                        <tr class="border-b border-slate-100 text-xs">
                            <td class="py-2.5 font-medium text-slate-800">${al.nombre} <span class="text-slate-400 font-normal">(${al.curso_nombre})</span></td>
                            <td class="py-2.5 text-blue-600 font-bold">Activo</td>
                            <td class="py-2.5 text-right">
                                <button onclick="reiniciarClaveAlumno(${al.id}, '${al.nombre}')" class="text-[10px] text-slate-600 font-semibold bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition">Reiniciar Clave</button>
                            </td>
                        </tr>
                    `;
                });
            } else {
                tablaAlumnos.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-xs text-slate-400 italic">No hay alumnos registrados.</td></tr>`;
            }
        }
        
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error("Error al cargar el panel docente:", err);
    }
}

function seleccionarCursoDocente(id, nombre, fechas) {
    cursoActualDocenteId = id;
    const fechasBox = document.getElementById('docente-fechas-box');
    if (fechasBox) {
        fechasBox.innerText = fechas ? fechas : "No hay fechas importantes agendadas para " + nombre;
    }
}

async function reiniciarClaveAlumno(id, nombre) {
    if (confirm(`¿Querés restaurar la clave de "${nombre}" a la contraseña inicial "usuario"?`)) {
        const res = await fetch(`/api/alumnos/${id}/reiniciar`, { method: 'POST' });
        if (res.ok) alert("Contraseña reestablecida correctamente.");
    }
}

function exportarBackup() {
    window.open('/api/docente/backup/exportar', '_blank');
}

function logout() {
    alumnoSeleccionadoId = null;
    cursoActualDocenteId = null;
    switchView('view-login');
}
