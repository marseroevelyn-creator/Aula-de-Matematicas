// =========================================================================
// CONTROL GLOBAL DE ESTADOS DE LA AULA DE MATEMÁTICAS
// =========================================================================
let cursoActualId = null; // ID del curso activo seleccionado
let cursoSeleccionadoProfesorId = null; // Sincronización global para el registro de alumnos
let bancoTareasCache = []; // Cache local de tareas pedagógicas
let listaAlumnosCache = []; // Cache predictiva para autocompletado de acceso

// =========================================================================
// --- MANEJO DE CONTRASEÑA ("OJO" EN LOGIN) ---
// =========================================================================
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

// =========================================================================
// --- SISTEMA DE AUTOCOMPLETADO PREDICTIVO PARA LOGIN ---
// =========================================================================
async function precargarUsuariosParaLogin() {
    try {
        const res = await fetch('/api/usuarios');
        const usuarios = await res.json();
        // Guardamos solo los que tienen rol de alumno para proteger la privacidad de la profesora
        listaAlumnosCache = usuarios.filter(u => u.rol === 'alumno').map(u => u.username);
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

    // Filtramos los nombres que comiencen con las letras tipeadas
    const filtrados = listaAlumnosCache.filter(username => 
        username.toLowerCase().startsWith(texto)
    );

    if (filtrados.length === 0) {
        cajaSugerencias.innerHTML = '';
        cajaSugerencias.classList.add('hidden');
        return;
    }

    // Renderizamos las opciones de coincidencia
    cajaSugerencias.innerHTML = filtrados.map(username => `
        <div class="sugerencia-item" onclick="seleccionarUsuarioSugerido('${username}')">${username}</div>
    `).join('');
    
    cajaSugerencias.classList.remove('hidden');
}

function seleccionarUsuarioSugerido(username) {
    document.getElementById('login-username').value = username;
    const cajaSugerencias = document.getElementById('login-sugerencias');
    cajaSugerencias.innerHTML = '';
    cajaSugerencias.classList.add('hidden');
    
    // Enfocamos directamente el campo contraseña para agilizar el ingreso
    document.getElementById('login-password').focus();
}

// Ocultar la caja si el alumno hace clic fuera del input
document.addEventListener('click', (e) => {
    if (e.target.id !== 'login-username') {
        const sugerencias = document.getElementById('login-sugerencias');
        if (sugerencias) sugerencias.classList.add('hidden');
    }
});

// Forzamos la ejecución de la precarga al iniciar el script global
precargarUsuariosParaLogin();

// =========================================================================
// --- ACCESO / LOGIN GLOBAL ---
// =========================================================================
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

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
                let nueva = '';
                while(nueva.length < 4) {
                    nueva = prompt("Primer ingreso: Crea una contraseña segura de al menos 4 dígitos:");
                    if(!nueva) nueva = '';
                }
                await fetch('/api/auth/cambiar-clave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nuevaClave: nueva })
                });
            }
            document.getElementById('section-alumno').classList.remove('hidden');
            inicializarAlumno();
        }
    } else {
        alert(data.message);
    }
});

// =========================================================================
// --- LÓGICA E INICIALIZACIÓN DE LA PROFESORA ---
// =========================================================================
async function inicializarProfesora() {
    await cargarCursos();
    await cargarTareasGlobales();
    
    // Poblar el selector superior de cursos para mantener concordancia con la interfaz
    try {
        const res = await fetch('/api/cursos');
        const cursos = await res.json();
        const selectFiltro = document.getElementById('filtro-curso-profesora');
        if(selectFiltro) {
            selectFiltro.innerHTML = '<option value="">-- Seleccione un curso aquí --</option>';
            cursos.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.nombre;
                selectFiltro.appendChild(opt);
            });
        }
    } catch(err) {
        console.error("Error inicializando select superior de la profesora:", err);
    }
}

// Carga general de control de tarjetas horizontales (opcional para control redundante)
async function cargarCursos() {
    try {
        const res = await fetch('/api/cursos');
        const cursos = await res.json();
        const container = document.getElementById('lista-cursos-render');
        if (container) {
            container.innerHTML = cursos.map(c => `
                <div class="item-curso-nodo">
                    <strong>${c.nombre}</strong>
                    <button onclick="editarCurso('${c.id}', '${c.nombre}', '${c.whatsapp_link || ''}')" class="btn-secondary" style="padding:2px 6px; font-size:11px;">✏️</button>
                    <button onclick="eliminarCurso('${c.id}')" class="btn-danger" style="padding:2px 6px; font-size:11px;">🗑️</button>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error("Error al cargar lista horizontal de cursos:", err);
    }
}

// Sincroniza el curso seleccionado arriba con la visualización central de alumnos y tareas entregadas
async function cambiarCursoActivoProfesor(cursoId) {
    cursoSeleccionadoProfesorId = cursoId;
    cursoActualId = cursoId; // Enlaza el ID para asignación directa de actividades
    
    const contenedorAlumnos = document.getElementById('vista-alumnos-curso');
    
    if (!cursoId) {
        contenedorAlumnos.innerHTML = '<p style="color: var(--text-muted); text-align: center; width: 100%;">Por favor, seleccione un curso en el desplegable superior para auditar a sus estudiantes.</p>';
        return;
    }

    contenedorAlumnos.innerHTML = '<p style="text-align:center; font-size:13px; width: 100%;">Cargando alumnos del curso activo...</p>';

    try {
        // Obtenemos los usuarios del backend
        const res = await fetch('/api/usuarios'); 
        const usuarios = await res.json();

        // Filtramos solo los que pertenezcan al rol alumno y a este curso id
        const alumnosDelCurso = usuarios.filter(u => u.rol === 'alumno' && String(u.curso_id) === String(cursoId));

        if (alumnosDelCurso.length === 0) {
            contenedorAlumnos.innerHTML = '<p style="color: var(--text-muted); text-align: center; width: 100%;">No hay alumnos registrados en este curso todavía.</p>';
            return;
        }

        // Renderizamos las tarjetas estructuradas de alumnos con sus operaciones administrativas
        contenedorAlumnos.innerHTML = alumnosDelCurso.map(alumno => `
            <div class="item-lista-accion">
                <div>
                    <strong style="display:block; font-size:14px; color: var(--text-main);">${alumno.username}</strong>
                    <span style="font-size:11px; color:var(--text-muted);">${alumno.debe_cambiar_clave ? '⚠️ Debe cambiar clave' : '✅ Clave establecida'}</span>
                </div>
                <div style="display:flex; gap:5px;">
                    <button onclick="reiniciarClaveAlumno('${alumno.id}')" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" title="Reiniciar clave de fábrica">🔄 Clave</button>
                    <button onclick="eliminarAlumno('${alumno.id}')" class="btn-danger" style="padding: 4px 8px; font-size: 11px;" title="Eliminar alumno del sistema">🗑️</button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error("Error al cargar alumnos por curso:", error);
        contenedorAlumnos.innerHTML = '<p style="color: var(--danger); font-size: 13px;">Error de red al procesar los alumnos.</p>';
    }
}

// --- CREACIÓN Y ADMINISTRACIÓN DE CURSOS ---
async function crearCurso() {
    const nombreInput = document.getElementById('nuevo-curso-nombre');
    const whatsappInput = document.getElementById('nuevo-curso-whatsapp');
    
    const nombre = nombreInput.value.trim();
    let whatsapp = whatsappInput.value.trim();

    if (!nombre) {
        alert("⚠️ Por favor, ingresa el nombre del curso.");
        nombreInput.focus();
        return;
    }

    if (whatsapp) {
        if (!whatsapp.startsWith('http://') && !whatsapp.startsWith('https://')) {
            whatsapp = 'https://' + whatsapp;
        }
    } else {
        whatsapp = "";
    }

    try {
        const res = await fetch('/api/cursos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, whatsapp_link: whatsapp })
        });
        const data = await res.json();

        if (data.id || data.success) {
            alert("🎉 Curso creado con éxito.");
            nombreInput.value = '';
            whatsappInput.value = '';
            await inicializarProfesora();
        } else {
            alert("Error al crear curso: " + (data.error || "Error inesperado"));
        }
    } catch (err) {
        console.error("Error en crearCurso:", err);
        alert("Hubo un error de conexión con el servidor.");
    }
}

async function editarCurso(id, nombreActual, waActual) {
    const nuevoNombre = prompt("Editar nombre del curso:", nombreActual);
    const nuevoWA = prompt("Editar enlace de WhatsApp:", waActual);
    if(nuevoNombre) {
        await fetch(`/api/cursos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nuevoNombre, whatsapp_link: nuevoWA })
        });
        await inicializarProfesora();
    }
}

async function eliminarCurso(id) {
    if(confirm("¿Seguro que deseas eliminar este curso junto a todos sus alumnos asociados de forma permanente?")) {
        await fetch(`/api/cursos/${id}`, { method: 'DELETE' });
        await inicializarProfesora();
        const contenedorAlumnos = document.getElementById('vista-alumnos-curso');
        if(contenedorAlumnos) {
            contenedorAlumnos.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Por favor, seleccione un curso en el desplegable superior para auditar a sus estudiantes.</p>';
        }
    }
}

// =========================================================================
// --- GESTIÓN DE ALUMNOS (ALTA, BAJA Y REINICIO) ---
// =========================================================================
async function cargarAlumnos() {
    const userInput = document.getElementById('nuevo-alumno-username');
    const passInput = document.getElementById('nuevo-alumno-password');
    
    const username = userInput.value.trim().toLowerCase();
    const password = passInput.value.trim();

    if (!cursoSeleccionadoProfesorId) {
        alert("⚠️ Por favor, selecciona primero un curso activo en el panel superior.");
        return;
    }

    if (!username || !password) {
        alert("⚠️ Por favor, completa el nombre de usuario y la contraseña provisoria.");
        return;
    }

    try {
        const res = await fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: username, 
                password: password, 
                rol: 'alumno', 
                curso_id: parseInt(cursoSeleccionadoProfesorId)
            })
        });
        const data = await res.json();

        if (data.id || data.success) {
            alert(`👤 Alumno "${username}" registrado correctamente.`);
            userInput.value = '';
            passInput.value = 'usuario'; // Reseteamos al valor cómodo por defecto
            
            // Refrescamos al instante el panel del curso seleccionado
            cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
        } else {
            alert("Error al registrar alumno: " + (data.error || "El nombre de usuario ya se encuentra en uso."));
        }
    } catch (err) {
        console.error("Error en cargarAlumnos:", err);
        alert("Hubo un error de red al intentar registrar al alumno.");
    }
}

async function reiniciarClaveAlumno(id) {
    if(confirm("¿Deseas restablecer la contraseña de este estudiante a la clave inicial 'usuario'?")) {
        // Adaptación segura utilizando la API de usuarios generales para preservar persistencia en Neon
        await fetch(`/api/usuarios/${id}/reiniciar`, { method: 'POST' })
        .then(res => {
            alert("🔑 Clave restablecida a 'usuario' con éxito.");
            cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
        }).catch(err => console.error(err));
    }
}

async function eliminarAlumno(id) {
    if(confirm("¿Eliminar definitivamente a este estudiante de las listas y registros del aula?")) {
        await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
        alert("Estudiante dado de baja.");
        cambiarCursoActivoProfesor(cursoSeleccionadoProfesorId);
    }
}

// =========================================================================
// --- LÓGICA Y AGENDAMIENTO DEL BANCO DE TAREAS ---
// =========================================================================
async function cargarTareasGlobales() {
    const res = await fetch('/api/tareas');
    bancoTareasCache = await res.json();
    renderizarBancoTareas();
    
    // Rellenar dinámicamente selectores de prerrequisitos y centros de auditoría
    const preSel = document.getElementById('t-prerrequisito');
    const revSel = document.getElementById('select-tareas-entregas');
    
    if(preSel) preSel.innerHTML = '<option value="">Ninguna (Inmediata)</option>';
    if(revSel) revSel.innerHTML = '<option value="">Selecciona una tarea para auditar entregas</option>';
    
    bancoTareasCache.forEach(t => {
        if(preSel) preSel.innerHTML += `<option value="${t.id}">${t.titulo} [${t.carpeta}]</option>`;
        if(revSel) revSel.innerHTML += `<option value="${t.id}">${t.titulo}</option>`;
    });
}

document.getElementById('form-nueva-tarea').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!cursoActualId && document.getElementById('t-asignacion-tipo').value === 'todo_el_curso') {
        alert("⚠️ No puedes asignar directamente si no seleccionas primero un curso en el panel.");
        return;
    }

    const formData = new FormData();
    formData.append('titulo', document.getElementById('t-titulo').value);
    formData.append('carpeta', document.getElementById('t-carpeta').value);
    formData.append('descripcion', document.getElementById('t-desc').value);
    formData.append('enlace_externo', document.getElementById('t-link').value);
    formData.append('requiere_entrega', document.getElementById('t-entrega').checked ? 'true' : 'false');
    formData.append('fecha_entrega', document.getElementById('t-fecha').value);
    formData.append('prerrequisito_id', document.getElementById('t-prerrequisito').value);
    formData.append('asignar_a', document.getElementById('t-asignacion-tipo').value);
    formData.append('curso_id', cursoActualId || "");

    const fileField = document.getElementById('t-file');
    if(fileField && fileField.files[0]) {
        formData.append('archivo', fileField.files[0]);
    }

    await fetch('/api/tareas', {
        method: 'POST',
        body: formData
    });

    alert("🎯 Actividad guardada y procesada de manera exitosa.");
    document.getElementById('form-nueva-tarea').reset();
    await cargarTareasGlobales();
});

function renderizarBancoTareas() {
    const queryInput = document.getElementById('input-buscar-tarea');
    const query = queryInput ? queryInput.value.toLowerCase() : '';
    const container = document.getElementById('banco-tareas-render');
    if (!container) return;
    
    container.innerHTML = '';

    // Agrupar tareas por Carpetas/Temas matemáticos de forma dinámica
    const carpetas = {};
    bancoTareasCache.forEach(t => {
        if(t.titulo.toLowerCase().includes(query) || t.carpeta.toLowerCase().includes(query)) {
            if(!carpetas[t.carpeta]) carpetas[t.carpeta] = [];
             carpetas[t.carpeta].push(t);
        }
    });

    for(let carpeta in carpetas) {
        let HTMLCarpeta = `<div style="margin-top:15px; border-left:4px solid var(--primary); padding-left:10px;"><h4>📁 Tema: ${carpeta}</h4>`;
        carpetas[carpeta].forEach(t => {
            HTMLCarpeta += `
                <div style="background:#f8fafc; padding:8px; margin:5px 0; border-radius:4px; font-size:13px; border: 1px solid var(--border-color);">
                    <strong>${t.titulo}</strong> ${t.requiere_entrega ? '<span style="color:var(--danger); font-size:11px;">[Entrega Obligatoria]</span>' : ''}
                    ${t.archivo_url ? `<br><a href="${t.archivo_url}" target="_blank" style="font-size:12px; color:var(--primary);">📄 Ver Adjunto</a>` : ''}
                </div>
            `;
        });
        HTMLCarpeta += `</div>`;
        container.innerHTML += HTMLCarpeta;
    }
}

// =========================================================================
// --- CENTRAL DE REVISIÓN Y ENTREGAS PEDAGÓGICAS ---
// =========================================================================
async function cargarEntregasDeTarea() {
    const tId = document.getElementById('select-tareas-entregas').value;
    const container = document.getElementById('tabla-entregas-render');
    if(!container) return;
    if(!tId) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = '<p style="text-align:center;">Buscando entregas de alumnos...</p>';
    
    const res = await fetch(`/api/entregas/tarea/${tId}`);
    const entregas = await res.json();
    container.innerHTML = '';

    if(entregas.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:10px;">No hay respuestas ni entregas registradas para esta actividad aún.</p>';
        return;
    }

    entregas.forEach(ent => {
        container.innerHTML += `
            <div class="card" style="background:var(--surface); border: 1px solid var(--border-color); padding:15px; margin-bottom:10px;">
                <p><strong>Estudiante:</strong> ${ent.username}</p>
                <p style="margin: 8px 0;"><a href="${ent.archivo_entrega_url}" target="_blank" class="btn-secondary" style="padding:4px 8px; font-size:12px; text-decoration:none; display:inline-block;">📥 Descargar Documento Entregado</a></p>
                <textarea id="dev-${ent.id}" style="width:100%; min-height:60px; margin-top:5px;" placeholder="Escribe aquí las correcciones o la devolución pedagógica...">${ent.devolucion || ''}</textarea>
                <div style="display:flex; gap:10px; margin-top:8px;">
                    <button onclick="enviarDevolucion(${ent.id}, false)" class="btn-primary" style="padding:6px 12px; font-size:12px;">Guardar Devolución</button>
                    <button onclick="enviarDevolucion(${ent.id}, true)" class="btn-danger" style="padding:6px 12px; font-size:12px;">🔄 Solicitar Rehacer</button>
                </div>
            </div>
        `;
    });
}

async function enviarDevolucion(id, reiniciar) {
    const devText = document.getElementById(`dev-${id}`).value;
    await fetch(`/api/devolucion/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devolucion: devText, reiniciar })
    });
    alert("Evaluación guardada correctamente en el servidor.");
    cargarEntregasDeTarea();
}


// =========================================================================
// --- LÓGICA GENERAL Y FEED DEL ALUMNO ---
// =========================================================================
async function inicializarAlumno() {
    const res = await fetch('/api/alumno/dashboard');
    const db = await res.json();

    document.getElementById('lbl-estudiante-nombre').textContent = db.usuario;
    document.getElementById('lbl-estudiante-curso').textContent = db.curso.nombre;
    
    if(db.curso.whatsapp_link) {
        document.getElementById('lnk-estudiante-wa').href = db.curso.whatsapp_link;
    }

    // Cargar Fechas Importantes
    const fContainer = document.getElementById('lbl-estudiante-fechas');
    fContainer.innerHTML = '';
    if(db.fechas.length === 0) fContainer.innerHTML = '<li>Sin eventos importantes guardados</li>';
    db.fechas.forEach(f => {
        fContainer.innerHTML += `<li>📅 ${new Date(f.fecha).toLocaleDateString()}: ${f.evento}</li>`;
    });

    // Separar y estructurar actividades Pendientes y Realizadas Cronológicamente
    const containerPendientes = document.getElementById('alumno-tareas-urgentes');
    const containerViejas = document.getElementById('alumno-tareas-viejas');
    const containerIndice = document.getElementById('alumno-indice-temas');
    
    containerPendientes.innerHTML = '';
    containerViejas.innerHTML = '';
    containerIndice.innerHTML = '';

    let vencidasContador = 0;
    const temasSet = new Set();

    db.tareas.forEach(t => {
        temasSet.add(t.carpeta);
        const esVencida = t.fecha_entrega && new Date(t.fecha_entrega) < new Date() && !t.completada;
        if(esVencida) vencidasContador++;

        let contenidoTareaHTML = `
            <div class="card" style="border-left: 5px solid ${t.completada ? 'var(--success)' : 'orange'}">
                <h4>${t.titulo} <small style="color:var(--text-muted);">[Tema: ${t.carpeta}]</small></h4>
                <p style="margin:6px 0; color:var(--text-main);">${t.descripcion || 'Sin instrucciones adicionales asignadas.'}</p>
                ${t.enlace_externo ? `<p>🔗 Enlace de soporte: <a href="${t.enlace_externo}" target="_blank" onclick="detectarMultimedia('${t.enlace_externo}', ${t.id})">${t.enlace_externo}</a></p>` : ''}
                ${t.archivo_url ? `<p>📄 Descargar material: <a href="${t.archivo_url}" target="_blank">Ver Archivo Adjunto</a></p>` : ''}
                ${t.devolucion ? `<p style="background:#f0fdf4; padding:10px; border-radius:6px; margin-top:8px; border:1px solid #bbf7d0;"><strong>Corrección de la Profesora:</strong> ${t.devolucion}</p>` : ''}
        `;

        if(!t.completada) {
            if(t.requiere_entrega) {
                contenidoTareaHTML += `
                    <hr style="margin:12px 0; border:0; border-top:1px solid var(--border-color);">
                    <form onsubmit="entregarTareaDesdeAlumno(event, ${t.id})">
                        <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:5px;">Subir tu archivo de entrega final desde el dispositivo:</label>
                        <input type="file" id="file-entrega-${t.id}" required style="margin-bottom:8px;">
                        <button type="submit" class="btn-primary" style="padding:6px 12px; font-size:13px; width:auto;">Enviar Entrega Obligatoria</button>
                    </form>
                `;
            } else {
                contenidoTareaHTML += `<button onclick="marcarComoCompletadaSimple(${t.id})" class="btn-success" style="padding:6px 12px; width:auto; font-size:13px; margin-top:10px;">Marcar Actividad como Hecha</button>`;
            }
            containerPendientes.appendChild(crearElementoNodo(contenidoTareaHTML + '</div>'));
        } else {
            contenidoTareaHTML += `<p style="color:var(--success); font-weight:bold; margin-top:10px; font-size:13px;">✅ Actividad Completada (Bloqueada para edición)</p>`;
            containerViejas.appendChild(crearElementoNodo(contenidoTareaHTML + '</div>'));
        }
    });

    // Notificaciones de urgencia por actividades vencidas en el Home
    const boxAlerta = document.getElementById('lbl-estudiante-alertas');
    if(vencidasContador > 0) {
        boxAlerta.classList.remove('hidden');
        boxAlerta.textContent = `⚠️ ¡Atención! Registras ${vencidasContador} actividades pedagógicas VENCIDAS sin entregar en el sistema.`;
    } else {
        boxAlerta.classList.add('hidden');
    }

    // Renderizar Índice de Temas de más antiguo a más nuevo
    temasSet.forEach(tema => {
        containerIndice.innerHTML += `<div style="padding:8px; background:#f1f5f9; margin-bottom:6px; border-radius:4px; font-weight:600; font-size:13px; border-left:3px solid var(--secondary);">📁 ${tema}</div>`;
    });
}

function crearElementoNodo(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
}

function detectarMultimedia(url, tareaId) {
    if(url.includes('youtube.com') || url.includes('youtu.be') || url.includes('mp4')) {
        alert("📢 Recordatorio del Aula: Recuerda conectar y usar tus auriculares si te encuentras dentro del salón de clases.");
        fetch(`/api/alumno/video-visto/${tareaId}`, { method: 'POST' }).then(() => inicializarAlumno());
    }
}

async function marcarComoCompletadaSimple(tareaId) {
    await fetch(`/api/alumno/video-visto/${tareaId}`, { method: 'POST' });
    inicializarAlumno();
}

async function entregarTareaDesdeAlumno(e, tareaId) {
    e.preventDefault();
    const fileField = document.getElementById(`file-entrega-${tareaId}`);
    if(!fileField || !fileField.files[0]) {
        alert("Aviso: Debes adjuntar tu archivo o foto antes de pulsar sobre el botón de entregar.");
        return;
    }
    
    const formData = new FormData();
    formData.append('entrega', fileField.files[0]);

    await fetch(`/api/entregas/${tareaId}/alumno`, {
        method: 'POST',
        body: formData
    });

    alert("¡Felicidades! Entrega guardada con éxito persistente.");
    inicializarAlumno();
}

// =========================================================================
// --- TUTOR DE CONSULTAS MATEMÁTICAS (INTEGRACIÓN GEMINI AI) ---
// =========================================================================
async function enviarMensajeGemini() {
    const input = document.getElementById('gemini-input-text');
    const promptText = input.value.trim();
    if(!promptText) return;

    const chatLogs = document.getElementById('gemini-chat-logs');
    chatLogs.innerHTML += `<p><strong>Tú:</strong> ${promptText}</p>`;
    input.value = '';
    chatLogs.scrollTop = chatLogs.scrollHeight;

    const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
    });
    const data = await res.json();

    chatLogs.innerHTML += `<p style="background:#f0f9ff; border: 1px solid #e0f2fe; padding:8px; border-radius:6px;"><strong>Tutor DeltaMath AI 🤖:</strong> ${data.respuesta}</p>`;
    chatLogs.scrollTop = chatLogs.scrollHeight;
}

// =========================================================================
// --- COPIAS DE SEGURIDAD Y RESPALDOS DEL SISTEMA COMPLETO ---
// =========================================================================
async function descargarCopiaSeguridad() {
    const res = await fetch('/api/sistema/respaldo');
    const data = await res.json();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "respaldo_aula_matematica.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

async function subirCopiaSeguridad(input) {
    const archivo = input.files[0];
    if (!archivo) return;

    if (!confirm("⚠️ ¿Estás completamente seguro de restaurar este respaldo? Se sobrescribirán de manera permanente TODOS los datos actuales en Neon y Cloudinary.")) {
        input.value = ''; 
        return;
    }

    const lector = new FileReader();
    lector.onload = async (e) => {
        try {
            const datosJSON = JSON.parse(e.target.result);
            
            const res = await fetch('/api/sistema/restaurar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosJSON)
            });
            const data = await res.json();

            if (data.success) {
                alert("🎉 Copia de seguridad inyectada con éxito del sistema.");
                location.reload();
            } else {
                alert("Error al restaurar: " + data.error);
            }
        } catch (err) {
            alert("Error: El documento provisto no cuenta con la estructura JSON de respaldo.");
        }
    };
    lector.readAsText(archivo);
}

function logout() {
    if (confirm("¿Seguro que deseas cerrar tu sesión actual?")) {
        fetch('/api/auth/logout').then(() => {
            location.reload();
        });
    }
}
