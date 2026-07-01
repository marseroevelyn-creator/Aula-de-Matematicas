// =========================================================================
// VARIABLES DE ESTADO GLOBAL DEL CLIENTE
// =========================================================================
let alumnoSeleccionadoId = null;
let cursoActualDocenteId = null;

// Inicialización al cargar el documento
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa los íconos estilizados de Lucide
    if (window.lucide) lucide.createIcons();
    
    // Configura el buscador predictivo de alumnos en la pantalla de login
    initBuscadorPredictivo();
    
    // Configura los escuchadores de eventos para los formularios
    initFormularios();
});

// =========================================================================
// GESTIÓN DE VISTAS (SINGLE PAGE APPLICATION)
// =========================================================================
function switchView(viewId) {
    const vistas = ['view-login', 'view-login-docente', 'view-primer-ingreso', 'view-docente', 'view-alumno'];
    vistas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const vistaActiva = document.getElementById(viewId);
    if (vistaActiva) vistaActiva.classList.remove('hidden');
    
    // Re-renderizar íconos en la nueva vista activa
    if (window.lucide) lucide.createIcons();
}

function togglePassword(id) {
    const el = document.getElementById(id);
    if (el) {
        el.type = el.type === 'password' ? 'text' : 'password';
    }
}

// =========================================================================
// LOGUEO Y BUSCADOR PREDICTIVO (PANTALLA DE INICIO)
// =========================================================================
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
                    div.className = "px-4 py-2.5 text-xs hover:bg-slate-50 cursor-pointer font-medium text-slate-700 transition border-b border-slate-50 last:border-none";
                    div.innerText = `${alumno.nombre} (${alumno.curso_nombre})`;
                    
                    // Al hacer click, autocompleta el input y guarda el ID del alumno
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
            console.error("Error en el buscador predictivo:", err);
        }
    });

    // Cerrar la caja predictiva si se hace click afuera
    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== box) {
            box.classList.add('hidden');
        }
    });
}

function initFormularios() {
    // Formulario Login Alumno
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const contrasena = document.getElementById('login-clave').value;

            if (!alumnoSeleccionadoId) {
                alert("Por favor, seleccioná tu nombre de la lista desplegable.");
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
                alert(data.error || "Error al ingresar.");
            }
        });
    }

    // Formulario Login Docente
    const formDocente = document.getElementById('form-login-docente');
    if (formDocente) {
        formDocente.addEventListener('submit', async (e) => {
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
                alert("Contraseña docente incorrecta.");
            }
        });
    }

    // Formulario Cambio de Clave Obligatorio
    const formPrimerIngreso = document.getElementById('form-primer-ingreso');
    if (formPrimerIngreso) {
        formPrimerIngreso.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nuevaClave = document.getElementById('nueva-clave').value;

            const res = await fetch('/api/auth/primer-ingreso', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevaClave })
            });

            if (res.ok) {
                alert("¡Contraseña guardada con éxito!");
                switchView('view-alumno');
                cargarAlumnoWorkspace();
            } else {
                const data = await res.json();
                alert(data.error || "Hubo un problema.");
            }
        });
    }
}

// =========================================================================
// ENTORNO TRABAJO DEL ALUMNO & INTEGRADOR GEMINI AI
// =========================================================================
async function cargarAlumnoWorkspace() {
    try {
        const res = await fetch('/api/alumno/dashboard');
        if (!res.ok) return;
        const data = await res.json();

        // Actualizar encabezado del curso y link de WhatsApp si existe
        const subId = document.getElementById('header-alumno-subtitulo');
        if (subId && data.curso) {
            let whatsappHtml = data.curso.whatsapp_link 
                ? ` | <a href="${data.curso.whatsapp_link}" target="_blank" class="underline text-emerald-300 font-bold inline-flex items-center gap-0.5"><i data-lucide="phone" class="w-3 h-3"></i> Grupo WhatsApp</a>`
                : '';
            subId.innerHTML = `Curso: <span class="font-bold">${data.curso.nombre}</span>${whatsappHtml}`;
        }

        // Renderizado del Índice de Temas Lateral Requerido
        const contIndice = document.getElementById('alumno-indice-temas');
        const contActividades = document.getElementById('alumno-actividades-box');
        if (contIndice) contIndice.innerHTML = '';
        if (contActividades) contActividades.innerHTML = '';

        const temasUnicos = new Set();

        if (data.tareas && data.tareas.length > 0) {
            data.tareas.forEach(tarea => {
                temasUnicos.add(tarea.tema);

                // Crear tarjeta de actividad
                const card = document.createElement('div');
                card.className = `p-4 rounded-2xl border transition text-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4 ${
                    tarea.completada ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-blue-100 ring-1 ring-blue-50/40 shadow-sm'
                }`;

                // Alerta específica requerida si la actividad es de tipo video
                const eventoClick = tarea.tipo_recurso === 'video' 
                    ? `onclick="alert('Acordate de usar auriculares si estás adentro del salón de clases 🎧'); marcarActividadHecha(${tarea.tarea_id}, true);"`
                    : `onclick="marcarActividadHecha(${tarea.tarea_id}, false);"`;

                let botonAccion = tarea.completada
                    ? `<span class="text-green-600 bg-green-50 font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1">✓ Hecha</span>`
                    : `<button ${eventoClick} class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition shadow-sm">Marcar como Hecha</button>`;

                // Si tiene archivo o enlace externo adjunto por la docente
                let adjuntosHtml = '';
                if (tarea.archivo_url) {
                    adjuntosHtml += `<a href="${tarea.archivo_url}" target="_blank" class="text-blue-600 font-bold hover:underline block mt-1 inline-flex items-center gap-0.5"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> Descargar Material</a>`;
                } else if (tarea.enlace_externo) {
                    adjuntosHtml += `<a href="${tarea.enlace_externo}" target="_blank" class="text-indigo-600 font-bold hover:underline block mt-1 inline-flex items-center gap-0.5"><i data-lucide="link" class="w-3.5 h-3.5"></i> Abrir Enlace</a>`;
                }

                card.innerHTML = `
                    <div>
                        <span class="text-[9px] bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-500 uppercase tracking-wider">${tarea.tema}</span>
                        <h4 class="font-bold text-slate-900 mt-1 text-sm">${tarea.titulo}</h4>
                        <p class="text-slate-400 mt-0.5">Fecha límite: ${new Date(tarea.fecha_entrega).toLocaleDateString()}</p>
                        ${adjuntosHtml}
                    </div>
                    <div class="sm:text-right">
                        ${botonAccion}
                    </div>
                `;
                if (contActividades) contActividades.appendChild(card);
            });
        } else {
            if (contActividades) {
                contActividades.innerHTML = `<p class="text-xs text-slate-400 italic p-4 text-center">No tenés actividades programadas asignadas en este momento.</p>`;
            }
        }

        // Llenar el índice lateral
        temasUnicos.forEach(tema => {
            if (contIndice) {
                contIndice.innerHTML += `<a href="#" class="block px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition">${tema}</a>`;
            }
        });

        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error("Error al cargar panel del alumno:", err);
    }
}

async function marcarActividadHecha(tareaId, esVideo) {
    try {
        const res = await fetch('/api/alumno/completar-tarea', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tarea_id: tareaId, visto: esVideo })
        });
        if (res.ok) {
            cargarAlumnoWorkspace(); // Recargar lista de tareas reflejando cambios
        }
    } catch (err) {
        console.error("Error al completar la actividad:", err);
    }
}

// Consultas en tiempo real conectadas con Express y Gemini API
async function consultarIA() {
    const input = document.getElementById('input-gemini');
    const respuestaBox = document.getElementById('respuesta-gemini');
    if (!input || !respuestaBox) return;

    const duda = input.value.trim();
    if (!duda) return;

    respuestaBox.classList.remove('hidden');
    respuestaBox.innerHTML = `
        <div class="flex items-center gap-2 text-blue-600 font-medium">
            <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
            <span>Pensando una explicación matemática clara para vos...</span>
        </div>
    `;
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch('/api/gemini/consultar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duda })
        });
        const data = await res.json();

        if (res.ok) {
            respuestaBox.innerText = data.respuesta;
        } else {
            respuestaBox.innerText = "Lo siento, hubo un inconveniente al procesar tu consulta con el Tutor IA.";
        }
    } catch (err) {
        respuestaBox.innerText = "Error de conexión con el servidor.";
    }
    input.value = ''; // Limpiar el input de consulta
}

// =========================================================================
// ENTORNO ADMINISTRATIVO DEL PANEL DOCENTE
// =========================================================================
async function cargarDocenteDashboard() {
    try {
        const res = await fetch('/api/docente/dashboard');
        if (!res.ok) return;
        const data = await res.json();

        // 1. Renderizar botones de Cursos Activos
        const contenedorCursos = document.getElementById('lista-cursos');
        if (contenedorCursos) {
            contenedorCursos.innerHTML = '';
            data.cursos.forEach(curso => {
                contenedorCursos.innerHTML += `
                    <button onclick="seleccionarCursoDocente(${curso.id}, '${curso.nombre}', '${curso.fechas_importantes || ''}')" class="px-3.5 py-2 bg-blue-50 text-blue-700 border border-blue-100 font-bold rounded-xl text-xs flex items-center gap-1 hover:bg-blue-100 transition">
                        ${curso.nombre} <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                    </button>
                `;
            });
        }

        // 2. Renderizar filas de la tabla de Alumnos
        const tablaAlumnos = document.getElementById('tabla-alumnos');
        if (tablaAlumnos) {
            tablaAlumnos.innerHTML = '';
            data.alumnos.forEach(alumno => {
                tablaAlumnos.innerHTML += `
                    <tr class="hover:bg-slate-50/50 transition border-b border-slate-100 last:border-none">
                        <td class="py-3 font-semibold text-slate-900">${alumno.nombre} <span class="text-slate-400 font-normal text-[11px]">(${alumno.curso_nombre})</span></td>
                        <td class="py-3 font-bold text-blue-600">Al día</td>
                        <td class="py-3 text-right space-x-1">
                            <button onclick="reiniciarClaveAlumno(${alumno.id}, '${alumno.nombre}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] font-bold transition" title="Reiniciar Clave a 'usuario'">
                                Reiniciar Clave
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        // 3. Renderizar Banco de Tareas Global
        const contBanco = document.getElementById('banco-tareas');
        if (contBanco) {
            contBanco.innerHTML = '';
            data.bancoTareas.forEach(recurso => {
                contBanco.innerHTML += `
                    <div class="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs flex justify-between items-center">
                        <div>
                            <p class="font-bold text-slate-800">${recurso.titulo}</p>
                            <span class="text-[9px] text-slate-400 uppercase font-bold tracking-wider">${recurso.tema} (${recurso.tipo_recurso})</span>
                        </div>
                        <span class="text-[10px] text-blue-600 bg-blue-50 font-bold px-2 py-0.5 rounded-md">Creado</span>
                    </div>
                `;
            });
        }

        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error("Error al inicializar dashboard docente:", err);
    }
}

function seleccionarCursoDocente(id, nombre, fechas) {
    cursoActualDocenteId = id;
    const fechasBox = document.getElementById('docente-fechas-box');
    if (fechasBox) {
        fechasBox.innerText = fechas ? fechas : "No hay fechas importantes agendadas para " + nombre;
    }
    alert(`Gestionando de forma activa el curso: ${nombre}`);
}

async function reiniciarClaveAlumno(id, nombre) {
    if (confirm(`¿Estás segura de restablecer la clave de "${nombre}" a la contraseña por defecto ("usuario")?`)) {
        try {
            const res = await fetch(`/api/alumnos/${id}/reiniciar`, { method: 'POST' });
            if (res.ok) {
                alert("La contraseña del alumno fue reseteada con éxito a 'usuario'.");
                cargarDocenteDashboard();
            }
        } catch (err) {
            console.error(err);
        }
    }
}

// Exportar copia completa de seguridad en formato de archivo JSON descargable
function exportarBackup() {
    window.open('/api/docente/backup/exportar', '_blank');
}

// Cierre de Sesión Seguro (Limpieza de Estados)
function logout() {
    alumnoSeleccionadoId = null;
    cursoActualDocenteId = null;
    
    const inputNombre = document.getElementById('login-nombre');
    const inputClave = document.getElementById('login-clave');
    const inputDocenteClave = document.getElementById('docente-clave');
    
    if (inputNombre) inputNombre.value = '';
    if (inputClave) inputClave.value = '';
    if (inputDocenteClave) inputDocenteClave.value = '';
    
    switchView('view-login');
}
