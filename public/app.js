// CONTROL GLOBAL DE ESTADOS DE LA AULA DE MATEMÁTICAS
let cursoActualId = null;
let cursoSeleccionadoProfesorId = null;
let bancoTareasCache = [];
let listaAlumnosCache = [];
let usuarioLogueadoId = null;

// --- MANEJO DE CONTRASEÑA ("OJO") ---
const btnTogglePwd = document.getElementById('btn-toggle-pwd');
if (btnTogglePwd) {
    btnTogglePwd.addEventListener('click', () => {
        const pwdInput = document.getElementById('login-password');
        if (pwdInput) {
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                btnTogglePwd.textContent = '🙈';
            } else {
                pwdInput.type = 'password';
                btnTogglePwd.textContent = '👁️';
            }
        }
    });
}

// --- REDIRECCIÓN AL ACCESO DEL PANEL DOCENTE (CORREGIDO) ---
const btnIrAdmin = document.getElementById('btn-ir-admin');
if (btnIrAdmin) {
    btnIrAdmin.addEventListener('click', () => {
        const usernameInput = document.getElementById('login-username');
        const pwdInput = document.getElementById('login-password');
        
        if (usernameInput) usernameInput.value = 'profesora';
        if (pwdInput) {
            pwdInput.value = '';
            pwdInput.focus();
        }
        
        const cajaSugerencias = document.getElementById('login-sugerencias');
        if (cajaSugerencias) {
            cajaSugerencias.innerHTML = '';
            cajaSugerencias.classList.add('hidden');
        }
    });
}

// --- SISTEMA DE AUTOCOMPLETADO PREDICTIVO PARA LOGIN (BOCETO 5) ---
async function precargarUsuariosParaLogin() {
    try {
        const res = await fetch('/api/usuarios');
        const usuarios = await res.json();
        listaAlumnosCache = usuarios.filter(u => u.rol === 'alumno');
    } catch (err) {
        console.error("No se pudieron precargar los usuarios para el autocompletado:", err);
    }
}

function filtrarUsuariosLogin(busqueda) {
    const cajaSugerencias = document.getElementById('login-sugerencias');
    if (!cajaSugerencias) return;

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
    const usernameInput = document.getElementById('login-username');
    const pwdInput = document.getElementById('login-password');
    const cajaSugerencias = document.getElementById('login-sugerencias');

    if (usernameInput) usernameInput.value = username;
    if (cajaSugerencias) cajaSugerencias.classList.add('hidden');
    if (pwdInput) pwdInput.focus();
}

// Inicializar el buscador predictivo al cargar el script
precargarUsuariosParaLogin();


// --- MANEJO DE INGRESO Y LOGOUT ---
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('login-username');
        const pwdInput = document.getElementById('login-password');
        
        if (!usernameInput || !pwdInput) return;
        
        const username = usernameInput.value.trim();
        const password = pwdInput.value;

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
}

// Forzar el cambio de clave inicial a alumnos nuevos
const btnGuardarPrimeraClave = document.getElementById('btn-guardar-primera-clave');
if (btnGuardarPrimeraClave) {
    btnGuardarPrimeraClave.addEventListener('click', async () => {
        const nuevaInput = document.getElementById('nueva-clave-alumno');
        if (!nuevaInput) return;
        const nueva = nuevaInput.value;
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
}


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
        if (!select) return;
        select.innerHTML = '<option value="">-- Seleccione un curso --</option>';
        cursos.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });
    } catch (err) {
        console.error("Error cargando cursos:", err);
    }
}

async function cambiarCursoActiveProfesor(cursoId) {
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
        // 1. Cargar alumnos y progresos del servidor
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

        // 2. Actualizar las tareas e informes vinculados
        await renderizarTareasAsignadasAlCurso();
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
    const nombreInput = document.getElementById('nuevo-curso-nombre');
    const waInput = document.getElementById('nuevo-curso-whatsapp');
    if (!nombreInput || !waInput) return;

    const nombre = nombreInput.value.trim();
    const wa = waInput.value.trim();
    if (!nombre) { alert("El nombre del curso es obligatorio."); return; }

    try {
        await fetch('/api/cursos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, whatsapp_link: wa })
        });
        cerrarModalCurso();
        nombreInput.value = '';
        waInput.value = '';
        await cargarCursosSelector();
    } catch (err) {
        alert("Error al guardar el nuevo curso.");
    }
}

// --- ALTA DE ESTUDIANTES DIRECTA (PROTEGIDA ANTE COMPONENTES NULOS) ---
// --- ALTA DE ESTUDIANTES DIRECTA (CORRECCIÓN DE ID) ---
const formCrearAlumno = document.getElementById('form-crear-alumno');
if (formCrearAlumno) {
    formCrearAlumno.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('nuevo-alumno-username');
        if (!input) return;
        const username = input.value.trim().toLowerCase();

        // Validación estricta en el cliente para evitar enviar valores vacíos o corruptos
        if (!cursoSeleccionadoProfesorId || isNaN(parseInt(cursoSeleccionadoProfesorId))) {
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
            
            if (res.ok && (data.success || data.id)) {
                alert(`👤 Alumno "${username}" registrado con éxito.\nSu clave automática inicial es "usuario".`);
                input.value = '';
                cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
                precargarUsuariosParaLogin();
            } else {
                alert("Error del servidor: " + (data.error || "El nombre de usuario ya existe o los datos son inválidos."));
            }
        } catch (err) {
            alert("Error de conexión al registrar al estudiante.");
        }
    });
}

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


// --- BANCO GLOBAL DE RECURSOS ---
function mostrarModalTarea() { document.getElementById('modal-tarea').classList.remove('hidden'); }
function cerrarModalTarea() { document.getElementById('modal-tarea').classList.add('hidden'); }

async function cargarTareasGlobales() {
    try {
        const res = await fetch('/api/tareas');
        bancoTareasCache = await res.json();
        renderizarBancoTareas();
        
        const pre = document.getElementById('t-prerrequisito');
        if(pre) {
            pre.innerHTML = '<option value="">Sin prerrequisito</option>';
            bancoTareasCache.forEach(t => {
                pre.innerHTML += `<option value="${t.id}">${t.titulo}</option>`;
            });
        }
    } catch (err) {
        console.error(err);
    }
}

function renderizarBancoTareas() {
    const inputBuscar = document.getElementById('input-buscar-tarea');
    const container = document.getElementById('banco-tareas-render');
    if(!container) return;
    
    const query = inputBuscar ? inputBuscar.value.toLowerCase() : '';
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
                    <span><strong>${t.titulo}</strong> ${t.archivo_url ? '📄 (Adjunto)' : ''}</span>
                    <button onclick="asignarTareaACurso(${t.id})" class="btn-success" style="padding:4px 8px; font-size:11px;">+ Asignar</button>
                </div>
            `;
        });
        htmlUnidad += `</div>`;
        container.innerHTML += htmlUnidad;
    }
}

// Formulario de nueva tarea blindado contra nulos
const formNuevaTarea = document.getElementById('form-nueva-tarea');
if (formNuevaTarea) {
    formNuevaTarea.addEventListener('submit', async (e) => {
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

        const fileInput = document.getElementById('t-file');
        const file = fileInput ? fileInput.files[0] : null;
        if (file) formData.append('archivo', file);

        try {
            const res = await fetch('/api/tareas', { method: 'POST', body: formData });
            if (res.ok) {
                cerrarModalTarea();
                formNuevaTarea.reset();
                await cargarTareasGlobales();
                if(cursoSeleccionadoProfesorId) cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
            } else {
                alert("Error al subir el recurso al servidor.");
            }
        } catch(err) {
            console.error(err);
        }
    });
}

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
    if(confirm("¿Deseas remover esta actividad del curso actual?")) {
        await fetch(`/api/asignaciones/curso/${cursoSeleccionadoProfesorId}/tarea/${tareaId}`, { method: 'DELETE' });
        renderizarTareasAsignadasAlCurso();
    }
}


// --- GESTIÓN DE FECHAS IMPORTANTES ---
async function cargarFechasImportantesAdmin() {
    const lista = document.getElementById('lista-fechas-admin');
    if(!lista) return;
    try {
        const res = await fetch('/api/fechas');
        const fechas = await res.json();
        lista.innerHTML = fechas.map(f => `
            <li style="font-size:12px; margin-bottom:6px; display:flex; justify-content:space-between;">
                <span>📅 <strong>${f.fecha.split('T')[0]}:</strong> ${f.evento}</span>
                <button onclick="eliminarFecha('${f.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer;">🗑️</button>
            </li>
        `).join('');
    } catch(err) {
        console.error(err);
    }
}

const formNuevaFecha = document.getElementById('form-nueva-fecha');
if (formNuevaFecha) {
    formNuevaFecha.addEventListener('submit', async (e) => {
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
    try {
        const res = await fetch('/api/tareas');
        const tareas = await res.json();
        select.innerHTML = '<option value="">-- Ver entregas por actividad --</option>';
        tareas.forEach(t => {
            select.innerHTML += `<option value="${t.id}">${t.titulo} (${t.carpeta})</option>`;
        });
    } catch (err) {
        console.error(err);
    }
}

async function cargarEntregasDeTarea() {
    const select = document.getElementById('select-tareas-entregas');
    const render = document.getElementById('tabla-entregas-render');
    if(!render || !select) return;
    
    const tareaId = select.value;
    if(!tareaId) { render.innerHTML = ''; return; }

    const res = await fetch(`/api/asignaciones/tarea/${tareaId}/entregas`);
    const entregas = await res.json();

    if(entregas.length === 0) {
        render.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">No se registran entregas cargadas.</p>';
        return;
    }

    render.innerHTML = entregas.map(e => `
        <div class="card" style="border: 1px solid var(--border); padding:12px; font-size:13px;">
            <p><strong>Estudiante:</strong> ${e.alumno_nombre}</p>
            <p><strong>Estado:</strong> ${e.completada ? '✅ Aprobado' : '⏳ Pendiente'}</p>
            ${e.archivo_entrega_url ? `<p>🔗 <a href="${e.archivo_entrega_url}" target="_blank" style="color:var(--primary); font-weight:bold;">Ver captura enviada</a></p>` : '<p style="color:var(--text-muted);">Sin adjuntos</p>'}
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
    const devInput = document.getElementById(`dev-${asignacionId}`);
    const dev = devInput ? devInput.value : '';
    await fetch(`/api/asignaciones/${asignacionId}/corregir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devolucion: dev, completada: aprobar })
    });
    alert("Corrección registrada en la base de datos.");
    cargarEntregasDeTarea();
}
// Llamar a esto cuando la profesora pulse "Reasignar Tarea" porque está mal hecha
async function reasignarTareaAlumno(asignacionId) {
    const motivo = prompt("Escribí el motivo del rechazo o sugerencia para el alumno:");
    if (motivo === null) return;
    
    const res = await fetch(`/api/asignaciones/${asignacionId}/reasignar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    if (data.success) {
        alert("Tarea reasignada al alumno con éxito.");
        location.reload();
    }
}

// =========================================================================
// --- SECCIÓN: CONFIGURACIÓN Y CONTENIDOS DEL ALUMNO (FEED INTERACTIVO) ---
// =========================================================================
async function inicializarAlumno() {
    try {
        const res = await fetch('/api/alumno/dashboard');
        if(!res.ok) return;
        const db = await res.json();

        const nameLbl = document.getElementById('lbl-estudiante-nombre');
        const cursoLbl = document.getElementById('lbl-estudiante-curso');
        if (nameLbl) nameLbl.textContent = db.usuario;
        if (cursoLbl) cursoLbl.textContent = db.curso.nombre;
        
        const btnWa = document.getElementById('lnk-estudiante-wa');
        if (btnWa) {
            if(db.curso.whatsapp_link) {
                btnWa.href = db.curso.whatsapp_link;
                btnWa.style.display = 'inline-block';
            } else {
                btnWa.style.display = 'none';
            }
        }

        const containerPendientes = document.getElementById('alumno-tareas-urgentes');
        const containerViejas = document.getElementById('alumno-tareas-viejas');
        const containerIndice = document.getElementById('alumno-indice-temas');

        if (containerPendientes) containerPendientes.innerHTML = '';
        if (containerViejas) containerViejas.innerHTML = '';
        if (containerIndice) containerIndice.innerHTML = '';

        if(db.tareas.length === 0) {
            if (containerPendientes) containerPendientes.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No tenés actividades asignadas. ¡Al día!</p>';
            return;
        }

        let temasEncontrados = new Set();

        db.tareas.forEach(t => {
            temasEncontrados.add(t.carpeta);
            
            let formularioEntregaHtml = '';
            if (!t.completada) {
                if (t.requiere_entrega) {
                    formularioEntregaHtml = `
                        <div style="margin-top:12px; padding-top:10px; border-top:1px dashed #cbd5e1;">
                            <label style="font-size:11px; font-weight:bold; display:block; margin-bottom:4px;">Cargar foto de tu ejercicio:</label>
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
                    
                    ${t.archivo_url ? `<p style="margin-top:8px; font-size:12px;">📄 <a href="${t.archivo_url}" target="_blank" style="color:var(--primary); font-weight:bold;">Descargar material</a></p>` : ''}
                    ${t.enlace_externo ? `<p style="margin-top:4px; font-size:12px;">🔗 <a href="${t.enlace_externo}" target="_blank" style="color:var(--info); font-weight:bold;">Abrir recurso externo</a></p>` : ''}
                    
                    ${formularioEntregaHtml}
                </div>
            `;

            if (!t.completada) {
                if (containerPendientes) containerPendientes.innerHTML += htmlTarjeta;
            } else {
                if (containerViejas) containerViejas.innerHTML += htmlTarjeta;
            }
        });

        if (containerIndice) {
            temasEncontrados.forEach(tema => {
                containerIndice.innerHTML += `
                    <div style="padding:8px; background:#f8fafc; border:1px solid var(--border-color); margin-bottom:5px; font-size:12px; border-radius:6px; font-weight:500;">
                        📁 ${tema}
                    </div>
                `;
            });
        }

    } catch (err) {
        console.error("Error sincronizando el panel de alumnos:", err);
    }
}

async function entregarTareaConArchivo(asignacionId) {
    const inputArchivo = document.getElementById(`file-entrega-${asignacionId}`);
    if(!inputArchivo) return;
    const archivo = inputArchivo.files[0];
    if(!archivo) { alert("⚠️ Por favor, selecciona la foto o archivo de tu carpeta antes de enviar."); return; }

    const formData = new FormData();
    formData.append('archivo', archivo);

    try {
        alert("Enviando archivo... Esperá la confirmación.");
        const res = await fetch(`/api/asignaciones/${asignacionId}/entregar`, {
            method: 'POST',
            body: formData
        });
        if(res.ok) {
            alert("🎉 Tu entrega fue cargada con éxito.");
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
    if (!input) return;
    const text = input.value.trim();
    if(!text) return;

    const logs = document.getElementById('gemini-chat-logs');
    if (logs) {
        logs.innerHTML += `<p style="margin-bottom:8px;"><strong>Tú:</strong> ${text}</p>`;
        logs.scrollTop = logs.scrollHeight;
    }
    input.value = '';

    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
        });
        const data = await res.json();
        
        if (logs) {
            logs.innerHTML += `<p style="color:var(--primary); margin-bottom:8px;"><strong>Tutor DeltaMath AI:</strong> ${data.respuesta}</p>`;
            logs.scrollTop = logs.scrollHeight;
        }
    } catch (err) {
        if (logs) logs.innerHTML += `<p style="color:var(--danger)"><strong>Error:</strong> No pude procesar tu consulta.</p>`;
    }
}

function logout() { location.reload(); }
