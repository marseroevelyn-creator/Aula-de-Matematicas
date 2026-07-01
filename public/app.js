// CONTROL GLOBAL DE ESTADOS DE LA AULA DE MATEMÁTICAS
let cursoActualId = null;
let cursoSeleccionadoProfesorId = null;
let bancoTareasCache = [];
let listaAlumnosCache = [];
let usuarioLogueadoId = null;

// --- MANEJO DE CONTRASEÑA ("OJO") ---
document.getElementById('btn-toggle-pwd').addEventListener('click', () => {
    const pwdInput = document.getElementById('login-password');
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        document.getElementById('btn-toggle-pwd').textContent = '🙈';
    } else {
        pwdInput.type = 'password';
        document.getElementById('btn-toggle-pwd').textContent = '👁️';
    }
});

// --- REDIRECCIÓN AL ACCESO DEL PANEL DOCENTE (CORREGIDO) ---
if (document.getElementById('btn-ir-admin')) {
    document.getElementById('btn-ir-admin').addEventListener('click', () => {
        // Rellena el usuario automáticamente para ahorrarle tiempo
        document.getElementById('login-username').value = 'profesora';
        
        // Deja el campo de contraseña vacío y le da el foco para que la profesora la escriba manualmente
        const pwdInput = document.getElementById('login-password');
        pwdInput.value = '';
        pwdInput.focus();
        
        // Limpia cualquier sugerencia predictiva que haya quedado flotando
        document.getElementById('login-sugerencias').innerHTML = '';
        document.getElementById('login-sugerencias').classList.add('hidden');
    });
}

// --- SISTEMA DE AUTOCOMPLETADO PREDICTIVO PARA LOGIN (BOCETO 5) ---
async function precargarUsuariosParaLogin() {
    try {
        const res = await fetch('/api/usuarios');
        const usuarios = await res.json();
        // Guardamos solo los alumnos por privacidad de la profesora
        listaAlumnosCache = usuarios.filter(u => u.rol === 'alumno');
    } catch (err) {
        console.error("No se pudieron precargar los usuarios para el autocompletado:", err);
    }
}

function filtrarUsuariosLogin(busqueda) {
    const cajaSugerencias = document.getElementById('login-sugerencias');
    const texto = busqueda.trim().toLowerCase();

    if (!texto) {
        cajaSugerencias.innerHTML = '';
        cajaSugerencias.classList.add('hidden');
        return;
    }

    const filtrados = listaAlumnosCache.filter(u => u.username.toLowerCase().includes(texto));

    if (filtrados.length === 0) {
        cajaSugerencias.innerHTML = '';
        cajaSugerencias.classList.add('hidden');
        return;
    }

    cajaSugerencias.innerHTML = filtrados.map(u => `
        <div class="sugerencia-item" onclick="seleccionarUsuarioSugerido('${u.username}')">${u.username}</div>
    `).join('');
    cajaSugerencias.classList.remove('hidden');
}

function seleccionarUsuarioSugerido(username) {
    document.getElementById('login-username').value = username;
    document.getElementById('login-sugerencias').classList.add('hidden');
    document.getElementById('login-password').focus();
}

// Inicializar el buscador predictivo al cargar el script
precargarUsuariosParaLogin();


// --- MANEJO DE INGRESO Y LOGOUT ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('section-login').classList.add('hidden');
            
            if (data.rol === 'profesora') {
                document.getElementById('section-profesora').classList.remove('hidden');
                inicializarProfesora();
            } else {
                // Alumno entra: verificar si requiere cambiar clave por primera vez (Boceto 8)
                if (data.debeCambiar) {
                    document.getElementById('modal-primer-ingreso').classList.remove('hidden');
                } else {
                    document.getElementById('section-alumno').classList.remove('hidden');
                    inicializarAlumno();
                }
            }
        } else {
            alert("⚠️ " + data.message);
        }
    } catch (err) {
        console.error(err);
        alert("Error de red al intentar ingresar.");
    }
});

// Forzar el cambio de clave inicial a alumnos nuevos
document.getElementById('btn-guardar-primera-clave').addEventListener('click', async () => {
    const nueva = document.getElementById('nueva-clave-alumno').value;
    if (nueva.length < 4) {
        alert("⚠️ La contraseña debe tener al menos 4 dígitos por seguridad.");
        return;
    }
    try {
        const res = await fetch('/api/auth/cambiar-clave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevaClave: nueva })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('modal-primer-ingreso').classList.add('hidden');
            document.getElementById('section-alumno').classList.remove('hidden');
            inicializarAlumno();
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        alert("Error al intentar actualizar la clave.");
    }
});


// =========================================================================
// --- SECCIÓN: CONFIGURACIÓN Y FUNCIONES DE LA PROFESORA ---
// =========================================================================
async function inicializarProfesora() {
    await cargarCursosSelector();
    await cargarTareasGlobales();
    await cargarFechasImportantesAdmin();
}

async function cargarCursosSelector() {
    try {
        const res = await fetch('/api/cursos');
        const cursos = await res.json();
        const select = document.getElementById('filtro-curso-profesora');
        select.innerHTML = '<option value="">-- Seleccione un curso --</option>';
        cursos.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });
    } catch (err) {
        console.error("Error cargando cursos:", err);
    }
}

async function cambiarCursoActiveProfesor(cursoId) {
    // Soporte para variaciones de nombres de función
    cambiarCursoActivoProfesor(cursoId);
}

async function cambiarCursoActivoProfesor(cursoId) {
    cursoSeleccionadoProfesorId = cursoId;
    cursoActualId = cursoId;
    
    const tbodyAlumnos = document.getElementById('vista-alumnos-curso');
    if (!tbodyAlumnos) return;

    if (!cursoId) {
        tbodyAlumnos.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Seleccione un curso arriba para auditar alumnos.</td></tr>';
        return;
    }

    try {
        // 1. Cargar alumnos y sus progresos calculados en el servidor (Boceto 4)
        const res = await fetch(`/api/cursos/${cursoId}/alumnos-progreso`);
        const alumnos = await res.json();

        if (alumnos.length === 0) {
            tbodyAlumnos.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay alumnos registrados en este curso.</td></tr>';
        } else {
            tbodyAlumnos.innerHTML = alumnos.map(a => `
                <tr>
                    <td><strong>${a.username}</strong></td>
                    <td><span style="color:var(--success); font-weight:bold;">${a.progreso || 0}%</span></td>
                    <td>
                        <button onclick="reiniciarClaveAlumno('${a.id}')" class="btn-eye" style="padding: 4px 8px; font-size:11px;" title="Reiniciar Clave a 'usuario'">🔄 Clave</button>
                        <button onclick="eliminarAlumno('${a.id}')" class="btn-danger-sm">🗑️</button>
                    </td>
                </tr>
            `).join('');
        }

        // 2. Actualizar las tareas que están vinculadas a este curso
        await renderizarTareasAsignadasAlCurso();
        // 3. Actualizar el listado de entregas pendientes de corregir para este curso
        await actualizarSelectTareasEntregas();

    } catch (err) {
        console.error(err);
        tbodyAlumnos.innerHTML = '<tr><td colspan="3" style="color:var(--danger);">Error al sincronizar datos del curso.</td></tr>';
    }
}

// --- MODALES DE CURSO ---
function mostrarModalCurso() { document.getElementById('modal-curso').classList.remove('hidden'); }
function cerrarModalCurso() { document.getElementById('modal-curso').classList.add('hidden'); }
async function crearCurso() {
    const nombre = document.getElementById('nuevo-curso-nombre').value.trim();
    const wa = document.getElementById('nuevo-curso-whatsapp').value.trim();
    if (!nombre) { alert("El nombre del curso es obligatorio."); return; }

    try {
        await fetch('/api/cursos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, whatsapp_link: wa })
        });
        cerrarModalCurso();
        document.getElementById('nuevo-curso-nombre').value = '';
        document.getElementById('nuevo-curso-whatsapp').value = '';
        await cargarCursosSelector();
    } catch (err) {
        alert("Error al guardar el nuevo curso.");
    }
}

// --- ALTA DE ESTUDIANTES DIRECTA (SIN CONTRASEÑA MANUAL) ---
document.getElementById('form-crear-alumno').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('nuevo-alumno-username');
    const username = input.value.trim().toLowerCase();

    if (!cursoSeleccionadoProfesorId) {
        alert("⚠️ Por favor, selecciona primero un curso activo en el panel superior.");
        return;
    }

    try {
        const res = await fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                password: 'usuario', 
                rol: 'alumno', 
                curso_id: parseInt(cursoSeleccionadoProfesorId) 
            })
        });
        const data = await res.json();
        if (data.success || data.id) {
            alert(`👤 Alumno "${username}" registrado con éxito.\nSu clave automática inicial es "usuario".`);
            input.value = '';
            cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
            precargarUsuariosParaLogin();
        } else {
            alert("Error: " + (data.error || "El nombre de usuario ya está registrado."));
        }
    } catch (err) {
        alert("Error de conexión al registrar al estudiante.");
    }
});

async function reiniciarClaveAlumno(id) {
    if (!id || id === 'undefined') return alert("ID inválido.");
    if (confirm("¿Deseas restablecer la contraseña de este estudiante a la clave inicial 'usuario'?")) {
        const res = await fetch(`/api/usuarios/${id}/reiniciar`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert("🔑 Clave restablecida a 'usuario' con éxito.");
            cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
        }
    }
}

async function eliminarAlumno(id) {
    if (confirm("¿Estás seguro de dar de baja a este estudiante de forma permanente?")) {
        await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
        cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
        precargarUsuariosParaLogin();
    }
}


// --- BANCO GLOBAL DE RECURSOS (LÓGICA CON CLOUDINARY REAL) ---
function mostrarModalTarea() { document.getElementById('modal-tarea').classList.remove('hidden'); }
function cerrarModalTarea() { document.getElementById('modal-tarea').classList.add('hidden'); }

async function cargarTareasGlobales() {
    const res = await fetch('/api/tareas');
    bancoTareasCache = await res.json();
    renderizarBancoTareas();
    
    // Población predictiva de prerrequisitos en la interfaz flotante
    const pre = document.getElementById('t-prerrequisito');
    if(pre) {
        pre.innerHTML = '<option value="">Sin prerrequisito</option>';
        bancoTareasCache.forEach(t => {
            pre.innerHTML += `<option value="${t.id}">${t.titulo}</option>`;
        });
    }
}

function renderizarBancoTareas() {
    const query = document.getElementById('input-buscar-tarea').value.toLowerCase();
    const container = document.getElementById('banco-tareas-render');
    if(!container) return;
    
    container.innerHTML = '';
    const unidades = {};

    bancoTareasCache.forEach(t => {
        if (t.titulo.toLowerCase().includes(query) || t.carpeta.toLowerCase().includes(query)) {
            if (!unidades[t.carpeta]) unidades[t.carpeta] = [];
            unidades[t.carpeta].push(t);
        }
    });

    for (let unidad in unidades) {
        let htmlUnidad = `<div class="carpeta-tema"><h4>📁 ${unidad}</h4>`;
        unidades[unidad].forEach(t => {
            htmlUnidad += `
                <div class="recurso-item">
                    <span><strong>${t.titulo}</strong> ${t.archivo_url ? '📄 (Con Adjunto)' : ''}</span>
                    <button onclick="asignarTareaACurso(${t.id})" class="btn-success" style="padding:4px 8px; font-size:11px;">+ Asignar a Curso</button>
                </div>
            `;
        });
        htmlUnidad += `</div>`;
        container.innerHTML += htmlUnidad;
    }
}

// Envío de tareas procesando archivos binarios hacia Cloudinary a través de Multer
document.getElementById('form-nueva-tarea').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('titulo', document.getElementById('t-titulo').value);
    formData.append('carpeta', document.getElementById('t-carpeta').value);
    formData.append('descripcion', document.getElementById('t-desc').value);
    formData.append('enlace_externo', document.getElementById('t-link').value);
    formData.append('fecha_entrega', document.getElementById('t-fecha').value);
    
    const preId = document.getElementById('t-prerrequisito').value;
    if(preId) formData.append('prerrequisito_id', preId);
    
    formData.append('requiere_entrega', document.getElementById('t-entrega').checked ? 'true' : 'false');
    formData.append('asignar_a', 'banco_solo'); 

    const file = document.getElementById('t-file').files[0];
    if (file) formData.append('archivo', file);

    try {
        const res = await fetch('/api/tareas', { method: 'POST', body: formData });
        if (res.ok) {
            cerrarModalTarea();
            document.getElementById('form-nueva-tarea').reset();
            await cargarTareasGlobales();
            if(cursoSeleccionadoProfesorId) cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
        } else {
            alert("Error al subir el recurso al servidor.");
        }
    } catch(err) {
        console.error(err);
    }
});

async function asignarTareaACurso(tareaId) {
    if (!cursoSeleccionadoProfesorId) {
        alert("⚠️ Por favor, selecciona un curso activo en la barra superior antes de asignar.");
        return;
    }
    try {
        const res = await fetch('/api/asignaciones/asignar-grupo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ curso_id: parseInt(cursoSeleccionadoProfesorId), tarea_id: tareaId })
        });
        if(res.ok) {
            alert("🎯 Actividad vinculada al curso activo de forma correcta.");
            renderizarTareasAsignadasAlCurso();
        }
    } catch (err) {
        console.error(err);
    }
}

async function renderizarTareasAsignadasAlCurso() {
    const tbody = document.getElementById('tabla-tareas-asignadas');
    if (!tbody || !cursoSeleccionadoProfesorId) return;

    try {
        const res = await fetch(`/api/cursos/${cursoSeleccionadoProfesorId}/tareas`);
        const tareasAsignadas = await res.json();

        if(tareasAsignadas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No hay tareas asignadas vigentes en este curso.</td></tr>';
            return;
        }

        tbody.innerHTML = tareasAsignadas.map(t => `
            <tr>
                <td>${t.carpeta}</td>
                <td><strong>${t.titulo}</strong></td>
                <td>${t.prerrequisito_titulo ? `🛑 Requiere: ${t.prerrequisito_titulo}` : '✅ Libre'}</td>
                <td>
                    <button onclick="desvincularTareaCurso('${t.id}')" class="btn-danger-sm">Quitar</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function desvincularTareaCurso(tareaId) {
    if(confirm("¿Deseas remover esta actividad del curso actual? No borrará las entregas guardadas.")) {
        await fetch(`/api/asignaciones/curso/${cursoSeleccionadoProfesorId}/tarea/${tareaId}`, { method: 'DELETE' });
        renderizarTareasAsignadasAlCurso();
    }
}


// --- GESTIÓN DE FECHAS IMPORTANTES ---
async function cargarFechasImportantesAdmin() {
    const lista = document.getElementById('lista-fechas-admin');
    if(!lista) return;
    const res = await fetch('/api/fechas');
    const fechas = await res.json();
    lista.innerHTML = fechas.map(f => `
        <li style="font-size:12px; margin-bottom:6px; display:flex; justify-content:space-between;">
            <span>📅 <strong>${f.fecha.split('T')[0]}:</strong> ${f.evento}</span>
            <button onclick="eliminarFecha('${f.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer;">🗑️</button>
        </li>
    `).join('');
}

if(document.getElementById('form-nueva-fecha')) {
    document.getElementById('form-nueva-fecha').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fecha = document.getElementById('f-fecha').value;
        const evento = document.getElementById('f-evento').value;
        await fetch('/api/fechas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, evento })
        });
        document.getElementById('f-evento').value = '';
        cargarFechasImportantesAdmin();
    });
}

async function eliminarFecha(id) {
    await fetch(`/api/fechas/${id}`, { method: 'DELETE' });
    cargarFechasImportantesAdmin();
}


// --- AUDITORÍA Y CORRECCIÓN DE ENTREGAS ---
async function actualizarSelectTareasEntregas() {
    const select = document.getElementById('select-tareas-entregas');
    if(!select) return;
    const res = await fetch('/api/tareas');
    const tareas = await res.json();
    select.innerHTML = '<option value="">-- Ver entregas por actividad --</option>';
    tareas.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.titulo} (${t.carpeta})</option>`;
    });
}

async function cargarEntregasDeTarea() {
    const tareaId = document.getElementById('select-tareas-entregas').value;
    const render = document.getElementById('tabla-entregas-render');
    if(!render) return;
    if(!tareaId) { render.innerHTML = ''; return; }

    const res = await fetch(`/api/asignaciones/tarea/${tareaId}/entregas`);
    const entregas = await res.json();

    if(entregas.length === 0) {
        render.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">No se registran entregas cargadas para este recurso en ningún curso.</p>';
        return;
    }

    render.innerHTML = entregas.map(e => `
        <div class="card" style="border: 1px solid var(--border); padding:12px; font-size:13px;">
            <p><strong>Estudiante:</strong> ${e.alumno_nombre}</p>
            <p><strong>Estado:</strong> ${e.completada ? '✅ Aprobado/Visto' : '⏳ Pendiente'}</p>
            ${e.archivo_entrega_url ? `<p>🔗 <a href="${e.archivo_entrega_url}" target="_blank" style="color:var(--primary); font-weight:bold;">Ver captura/archivo enviado</a></p>` : '<p style="color:var(--text-muted);">Sin adjuntos</p>'}
            <div style="margin-top:8px;">
                <input type="text" id="dev-${e.id}" placeholder="Escribe una devolución..." value="${e.devolucion || ''}" style="margin-bottom:5px; padding:6px;">
                <div style="display:flex; gap:5px;">
                    <button onclick="guardarCorreccion('${e.id}', true)" class="btn-success" style="padding:4px 8px; font-size:11px;">Aprobar</button>
                    <button onclick="guardarCorreccion('${e.id}', false)" class="btn-secondary" style="padding:4px 8px; font-size:11px;">Recomendar corrección</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function guardarCorreccion(asignacionId, aprobar) {
    const dev = document.getElementById(`dev-${asignacionId}`).value;
    await fetch(`/api/asignaciones/${asignacionId}/corregir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devolucion: dev, completada: aprobar })
    });
    alert("Corrección registrada en la base de datos.");
    cargarEntregasDeTarea();
}


// =========================================================================
// --- SECCIÓN: CONFIGURACIÓN Y CONTENIDOS DEL ALUMNO (FEED INTERACTIVO) ---
// =========================================================================
async function inicializarAlumno() {
    try {
        const res = await fetch('/api/alumno/dashboard');
        if(!res.ok) return;
        const db = await res.json();

        document.getElementById('lbl-estudiante-nombre').textContent = db.usuario;
        document.getElementById('lbl-estudiante-curso').textContent = db.curso.nombre;
        
        const btnWa = document.getElementById('lnk-estudiante-wa');
        if(db.curso.whatsapp_link) {
            btnWa.href = db.curso.whatsapp_link;
            btnWa.style.display = 'inline-block';
        } else {
            btnWa.style.display = 'none';
        }

        const containerPendientes = document.getElementById('alumno-tareas-urgentes');
        const containerViejas = document.getElementById('alumno-tareas-viejas');
        const containerIndice = document.getElementById('alumno-indice-temas');

        containerPendientes.innerHTML = '';
        containerViejas.innerHTML = '';
        containerIndice.innerHTML = '';

        if(db.tareas.length === 0) {
            containerPendientes.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No tenés actividades vigentes asignadas. ¡Al día!</p>';
            return;
        }

        let temasEncontrados = new Set();

        db.tareas.forEach(t => {
            temasEncontrados.add(t.carpeta);
            
            // Renderizado dinámico de la tarjeta según el tipo de recurso solicitado
            let formularioEntregaHtml = '';
            if (!t.completada) {
                if (t.requiere_entrega) {
                    formularioEntregaHtml = `
                        <div style="margin-top:12px; padding-top:10px; border-top:1px dashed #cbd5e1;">
                            <label style="font-size:11px; font-weight:bold; display:block; margin-bottom:4px;">Cargar foto o archivo de tu ejercicio resoluto:</label>
                            <input type="file" id="file-entrega-${t.asignacion_id}" style="font-size:11px; margin-bottom:5px;">
                            <button onclick="entregarTareaConArchivo('${t.asignacion_id}')" class="btn-success" style="padding:4px 10px; font-size:12px;">Subir y Entregar</button>
                        </div>
                    `;
                } else {
                    formularioEntregaHtml = `
                        <div style="margin-top:10px; text-align:right;">
                            <button onclick="marcarVistoSimple('${t.asignacion_id}')" class="btn-primary" style="padding:4px 12px; font-size:12px;">Marcar como Realizado/Visto</button>
                        </div>
                    `;
                }
            } else {
                formularioEntregaHtml = `
                    <div style="margin-top:8px; padding:6px 10px; background:#f0fdf4; border-radius:4px; font-size:12px; color:#166534;">
                        <strong>Devolución docente:</strong> ${t.devolucion || '¡Excelente trabajo! Actividad revisada.'}
                    </div>
                `;
            }

            let htmlTarjeta = `
                <div class="card" style="border-left: 5px solid ${t.completada ? 'var(--success)' : 'orange'}; margin-bottom:15px; padding:15px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <span style="font-size:11px; background:#e2e8f0; padding:2px 6px; border-radius:4px; color:var(--text-muted); font-weight:bold;">${t.carpeta}</span>
                            <h4 style="margin:5px 0 3px 0; font-size:15px; color:var(--text-main);">${t.titulo}</h4>
                        </div>
                        ${t.fecha_entrega ? `<span style="font-size:11px; color:var(--danger);">📅 Límite: ${t.fecha_entrega.split('T')[0]}</span>` : ''}
                    </div>
                    <p style="font-size:13px; color:#475569; margin-top:6px;">${t.descripcion || 'Sin descripción adicional disponible.'}</p>
                    
                    ${t.archivo_url ? `<p style="margin-top:8px; font-size:12px;">📄 <a href="${t.archivo_url}" target="_blank" style="color:var(--primary); font-weight:bold;">Descargar material de soporte de la profesora</a></p>` : ''}
                    ${t.enlace_externo ? `<p style="margin-top:4px; font-size:12px;">🔗 <a href="${t.enlace_externo}" target="_blank" style="color:var(--info); font-weight:bold;">Abrir recurso externo (YouTube/GeoGebra)</a></p>` : ''}
                    
                    ${formularioEntregaHtml}
                </div>
            `;

            if (!t.completada) {
                containerPendientes.innerHTML += htmlTarjeta;
            } else {
                containerViejas.innerHTML += htmlTarjeta;
            }
        });

        // Crear el índice por temas dinámico en el costado (Boceto 8)
        temasEncontrados.forEach(tema => {
            containerIndice.innerHTML += `
                <div style="padding:8px; background:#f8fafc; border:1px solid var(--border-color); margin-bottom:5px; font-size:12px; border-radius:6px; font-weight:500; color:var(--text-main);">
                    📁 ${tema}
                </div>
            `;
        });

    } catch (err) {
        console.error("Error sincronizando el panel de alumnos:", err);
    }
}

async function entregarTareaConArchivo(asignacionId) {
    const inputArchivo = document.getElementById(`file-entrega-${asignacionId}`);
    const archivo = inputArchivo.files[0];
    if(!archivo) { alert("⚠️ Por favor, selecciona la foto o archivo de tu carpeta antes de enviar."); return; }

    const formData = new FormData();
    formData.append('archivo', archivo);

    try {
        alert("Enviando archivo a Cloudinary... Esperá la confirmación.");
        const res = await fetch(`/api/asignaciones/${asignacionId}/entregar`, {
            method: 'POST',
            body: formData
        });
        if(res.ok) {
            alert("🎉 Tu entrega fue cargada con éxito en el sistema central.");
            inicializarAlumno();
        } else {
            alert("Error al procesar el archivo en el servidor.");
        }
    } catch(err) {
        console.error(err);
    }
}

async function marcarVistoSimple(asignacionId) {
    await fetch(`/api/asignaciones/${asignacionId}/visto`, { method: 'POST' });
    inicializarAlumno();
}


// --- TUTOR MATEMÁTICO INTEGRADO CON GEMINI AI ---
async function enviarMensajeGemini() {
    const input = document.getElementById('gemini-input-text');
    const text = input.value.trim();
    if(!text) return;

    const logs = document.getElementById('gemini-chat-logs');
    logs.innerHTML += `<p style="margin-bottom:8px;"><strong>Tú:</strong> ${text}</p>`;
    input.value = '';
    logs.scrollTop = logs.scrollHeight;

    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
        });
        const data = await res.json();
        
        logs.innerHTML += `<p style="color:var(--primary); margin-bottom:8px;"><strong>Tutor DeltaMath AI:</strong> ${data.respuesta}</p>`;
        logs.scrollTop = logs.scrollHeight;
    } catch (err) {
        logs.innerHTML += `<p style="color:var(--danger)"><strong>Error:</strong> No pude procesar tu consulta en este momento.</p>`;
    }
}

function logout() {
    location.reload();
}
