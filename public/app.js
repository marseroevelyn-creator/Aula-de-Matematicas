// CONTROL GLOBAL DE ESTADOS DE LA AULA DE MATEMÁTICAS
let cursoActualId = null;
let bancoTareasCache = [];

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

// --- ACCESO / LOGIN ---
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

// --- LÓGICA DE LA PROFESORA ---
async function inicializarProfesora() {
    await cargarCursos();
    await cargarTareasGlobales();
}

async function cargarCursos() {
    const res = await fetch('/api/cursos');
    const cursos = await res.json();
    const container = document.getElementById('container-cursos-lista');
    container.innerHTML = '';
    
    cursos.forEach(c => {
        container.innerHTML += `
            <div class="item-lista-accion">
                <span style="font-weight:bold; cursor:pointer;" onclick="seleccionarCurso(${c.id}, '${c.nombre}')">📂 ${c.nombre}</span>
                <div>
                    <button onclick="editarCurso(${c.id}, '${c.nombre}', '${c.whatsapp_link || ''}')" style="padding:4px; font-size:10pt;">✏️</button>
                    <button onclick="eliminarCurso(${c.id})" style="padding:4px; font-size:10pt; background:red; color:white;">❌</button>
                </div>
            </div>
        `;
    });
}

document.getElementById('form-crear-curso').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('curso-nombre').value;
    const whatsapp_link = document.getElementById('curso-wa').value;
    await fetch('/api/cursos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, whatsapp_link })
    });
    document.getElementById('curso-nombre').value = '';
    document.getElementById('curso-wa').value = '';
    cargarCursos();
});

async function seleccionarCurso(id, nombre) {
    cursoActualId = id;
    document.getElementById('card-alumnos-gestion').classList.remove('hidden');
    document.getElementById('nombre-curso-seleccionado').textContent = nombre;
    cargarAlumnos();
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
        cargarCursos();
    }
}

async function eliminarCurso(id) {
    if(confirm("¿Seguro que deseas eliminar este curso y todos sus alumnos asociados?")) {
        await fetch(`/api/cursos/${id}`, { method: 'DELETE' });
        document.getElementById('card-alumnos-gestion').classList.add('hidden');
        cargarCursos();
    }
}

// GESTIÓN ALUMNO POR PROFESOR
async function cargarAlumnos() {
    const res = await fetch(`/api/alumnos/curso/${cursoActualId}`);
    const alumnos = await res.json();
    const container = document.getElementById('lista-alumnos-container');
    container.innerHTML = '';
    alumnos.forEach(al => {
        container.innerHTML += `
            <li class="item-lista-accion">
                <span>${al.username} (Clave por defecto: ${al.debe_cambiar_clave ? 'SÍ' : 'NO'})</span>
                <div>
                    <button onclick="reiniciarClaveAlumno(${al.id})" style="padding:4px; background:orange; font-size:9pt;">🔑 Reiniciar</button>
                    <button onclick="eliminarAlumno(${al.id})" style="padding:4px; background:red; color:white; font-size:9pt;">❌</button>
                </div>
            </li>
        `;
    });
}

document.getElementById('form-crear-alumno').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('alumno-username').value;
    await fetch('/api/alumnos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, curso_id: cursoActualId })
    });
    document.getElementById('alumno-username').value = '';
    cargarAlumnos();
});

async function reiniciarClaveAlumno(id) {
    if(confirm("¿Reiniciar la clave de este alumno a 'usuario'?")) {
        await fetch(`/api/alumnos/${id}/reiniciar`, { method: 'POST' });
        alert("Clave restablecida.");
    }
}

async function eliminarAlumno(id) {
    if(confirm("¿Eliminar definitivamente a este estudiante?")) {
        await fetch(`/api/alumnos/${id}`, { method: 'DELETE' });
        cargarAlumnos();
    }
}

// BANCO DE TAREAS LÓGICA
async function cargarTareasGlobales() {
    const res = await fetch('/api/tareas');
    bancoTareasCache = await res.json();
    renderizarBancoTareas();
    
    // Rellenar selectores de prerrequisitos y revisiones
    const preSel = document.getElementById('t-prerrequisito');
    const revSel = document.getElementById('select-tareas-entregas');
    preSel.innerHTML = '<option value="">Ninguna (Aparición inmediata)</option>';
    revSel.innerHTML = '<option value="">Selecciona una tarea para auditar entregas</option>';
    
    bancoTareasCache.forEach(t => {
        preSel.innerHTML += `<option value="${t.id}">${t.titulo} [${t.carpeta}]</option>`;
        revSel.innerHTML += `<option value="${t.id}">${t.titulo}</option>`;
    });
}

document.getElementById('form-nueva-tarea').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('titulo', document.getElementById('t-titulo').value);
    formData.append('carpeta', document.getElementById('t-carpeta').value);
    formData.append('descripcion', document.getElementById('t-desc').value);
    formData.append('enlace_externo', document.getElementById('t-link').value);
    formData.append('requiere_entrega', document.getElementById('t-entrega').checked ? 'true' : 'false');
    formData.append('fecha_entrega', document.getElementById('t-fecha').value);
    formData.append('prerrequisito_id', document.getElementById('t-prerrequisito').value);
    formData.append('asignar_a', document.getElementById('t-asignacion-tipo').value);
    formData.append('curso_id', cursoActualId);

    const fileField = document.getElementById('t-file');
    if(fileField.files[0]) {
        formData.append('archivo', fileField.files[0]);
    }

    await fetch('/api/tareas', {
        method: 'POST',
        body: formData
    });

    // Resetear formulario
    document.getElementById('form-nueva-tarea').reset();
    await cargarTareasGlobales();
});

function renderizarBancoTareas() {
    const query = document.getElementById('input-buscar-tarea').value.toLowerCase();
    const container = document.getElementById('banco-tareas-render');
    container.innerHTML = '';

    // Agrupar por Carpetas/Temas dinámicamente
    const carpetas = {};
    bancoTareasCache.forEach(t => {
        if(t.titulo.toLowerCase().includes(query) || t.carpeta.toLowerCase().includes(query)) {
            if(!carpetas[t.carpeta]) carpetas[t.carpeta] = [];
            carpetas[t.carpeta].push(t);
        }
    });

    for(let carpeta in carpetas) {
        let HTMLCarpeta = `<div style="margin-top:15px; border-left:4px solid #2b6cb0; padding-left:10px;"><h4>📁 Carpeta: ${carpeta}</h4>`;
        carpetas[carpeta].forEach(t => {
            HTMLCarpeta += `
                <div style="background:#f7fafc; padding:8px; margin:5px 0; border-radius:4px; font-size:11pt;">
                    <strong>${t.titulo}</strong> ${t.requiere_entrega ? '⚠️ [Requiere Subir Archivo]' : ''}
                    ${t.archivo_url ? `<br><a href="${t.archivo_url}" target="_blank">📄 Archivo adjunto persistente</a>` : ''}
                </div>
            `;
        });
        HTMLCarpeta += `</div>`;
        container.innerHTML += HTMLCarpeta;
    }
}

async function cargarEntregasDeTarea() {
    const tId = document.getElementById('select-tareas-entregas').value;
    if(!tId) return;
    const res = await fetch(`/api/entregas/tarea/${tId}`);
    const entregas = await res.json();
    const container = document.getElementById('tabla-entregas-render');
    container.innerHTML = '';

    if(entregas.length === 0) {
        container.innerHTML = '<p>No hay entregas registradas para esta actividad aún.</p>';
        return;
    }

    entregas.forEach(ent => {
        container.innerHTML += `
            <div class="card" style="background:#f8fafc; border: 1px solid #e2e8f0;">
                <p><strong>Alumno:</strong> ${ent.username}</p>
                <p><a href="${ent.archivo_entrega_url}" target="_blank" class="btn-secondary" style="padding:4px 8px; font-size:10pt; text-decoration:none;">📥 Descargar Documento Entregado</a></p>
                <textarea id="dev-${ent.id}" placeholder="Escribe aquí la devolución pedagógica...">${ent.devolucion || ''}</textarea>
                <button onclick="enviarDevolucion(${ent.id}, false)" class="btn-primary" style="padding:6px; font-size:10pt;">Guardar Devolución</button>
                <button onclick="enviarDevolucion(${ent.id}, true)" style="padding:6px; font-size:10pt; background:red; color:white;">🔄 Rehacer / Reiniciar Actividad</button>
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
    alert("Acción procesada correctamente.");
    cargarEntregasDeTarea();
}


// --- LÓGICA DEL ALUMNO ---
async function inicializarAlumno() {
    const res = await fetch('/api/alumno/dashboard');
    const db = await res.json();

    document.getElementById('lbl-estudiante-nombre').textContent = db.usuario;
    document.getElementById('lbl-estudiante-curso').textContent = db.curso.nombre;
    
    if(db.curso.whatsapp_link) {
        document.getElementById('lnk-estudiante-wa').href = db.curso.whatsapp_link;
    }

    // Cargar Fechas
    const fContainer = document.getElementById('lbl-estudiante-fechas');
    fContainer.innerHTML = '';
    if(db.fechas.length === 0) fContainer.innerHTML = '<li>Sin eventos importantes</li>';
    db.fechas.forEach(f => {
        fContainer.innerHTML += `<li>📅 ${new Date(f.fecha).toLocaleDateString()}: ${f.evento}</li>`;
    });

    // Separar y ordenar tareas Pendientes y Realizadas
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
            <div class="card" style="border-left: 5px solid ${t.completada ? 'green' : 'orange'}">
                <h4>${t.titulo} <small style="color:grey;">[Tema: ${t.carpeta}]</small></h4>
                <p>${t.descripcion || 'Sin descripción adicional.'}</p>
                ${t.enlace_externo ? `<p>🔗 Enlace de apoyo: <a href="${t.enlace_externo}" target="_blank" onclick="detectarMultimedia('${t.enlace_externo}', ${t.id})">${t.enlace_externo}</a></p>` : ''}
                ${t.archivo_url ? `<p>📄 Descargar material adjunto: <a href="${t.archivo_url}" target="_blank">Ver Archivo</a></p>` : ''}
                ${t.devolucion ? `<p style="background:#e6fffa; padding:8px; border-radius:6px;"><strong>Devolución de la Profe:</strong> ${t.devolucion}</p>` : ''}
        `;

        if(!t.completada) {
            if(t.requiere_entrega) {
                contenidoTareaHTML += `
                    <hr style="margin:10px 0;">
                    <form onsubmit="entregarTareaDesdeAlumno(event, ${t.id})">
                        <label style="font-size:10pt;">Subir tu archivo de entrega:</label>
                        <input type="file" id="file-entrega-${t.id}" required>
                        <button type="submit" class="btn-primary" style="padding:6px; font-size:10pt;">Enviar Entrega Obligatoria</button>
                    </form>
                `;
            } else {
                contenidoTareaHTML += `<button onclick="marcarComoCompletadaSimple(${t.id})" class="btn-success" style="padding:6px; width:auto; font-size:10pt; margin-top:10px;">Completar Actividad</button>`;
            }
            containerPendientes.appendChild(crearElementoNodo(contenidoTareaHTML + '</div>'));
        } else {
            contenidoTareaHTML += `<p style="color:green; font-weight:bold; margin-top:10px;">✅ Actividad Completada (Bloqueada para edición)</p>`;
            containerViejas.appendChild(crearElementoNodo(contenidoTareaHTML + '</div>'));
        }
    });

    // Alertas de vencimiento obligatorias en encabezado
    const boxAlerta = document.getElementById('lbl-estudiante-alertas');
    if(vencidasContador > 0) {
        boxAlerta.classList.remove('hidden');
        boxAlerta.textContent = `⚠️ ¡Atención! Tienes ${vencidasContador} actividades VENCIDAS sin entregar en el sistema.`;
    } else {
        boxAlerta.classList.add('hidden');
    }

    // Renderizar Índice Temático de más viejo a más nuevo
    temasSet.forEach(tema => {
        containerIndice.innerHTML += `<div style="padding:6px; background:#edf2f7; margin-bottom:5px; border-radius:4px; font-weight:bold;">📁 ${tema}</div>`;
    });
}

function crearElementoNodo(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
}

function detectarMultimedia(url, tareaId) {
    if(url.includes('youtube.com') || url.includes('youtu.be') || url.includes('mp4')) {
        alert("📢 Alerta de Aula: Recuerda usar auriculares si te encuentras dentro del salón de clases.");
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
    if(!fileField.files[0]) {
        alert("Aviso: Debes adjuntar y subir el archivo antes de presionar entregar.");
        return;
    }
    
    const formData = new FormData();
    formData.append('entrega', fileField.files[0]);

    await fetch(`/api/entregas/${tareaId}/alumno`, {
        method: 'POST',
        body: formData
    });

    alert("¡Entrega enviada y guardada con éxito persistente!");
    inicializarAlumno();
}

// --- GEMINI REAL CHAT LÓGICA ---
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

    chatLogs.innerHTML += `<p style="background:#ebf8ff;"><strong>Tutor Gemini AI 🤖:</strong> ${data.respuesta}</p>`;
    chatLogs.scrollTop = chatLogs.scrollHeight;
}

// COPIAS DE SEGURIDAD SISTEMA COMPLETO
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

function logout() {
    fetch('/api/auth/logout').then(() => location.reload());
}
// --- LÓGICA DIRECTA PARA EL BOTÓN DE IMPORTACIÓN DESDE EL LOGIN ---
document.getElementById('importar-archivo-directo')?.addEventListener('change', function(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;

    const lector = new FileReader();
    lector.onload = function(evt) {
        try {
            const datosJson = JSON.parse(evt.target.result);
            
            if (confirm("¿Estás segura de que deseas importar estos datos? Esto sobreescribirá la base de datos actual.")) {
                fetch('/api/sistema/restaurar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datosJson)
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        alert("¡Espectacular! Datos importados con éxito total. Ya puedes iniciar sesión con tus alumnos.");
                        window.location.reload();
                    } else {
                        alert("Hubo un problema al restaurar: " + data.error);
                    }
                })
                .catch(err => alert("Error de conexión con el servidor."));
            }
        } catch(error) {
            alert("El archivo seleccionado no es un JSON válido.");
        }
    };
    lector.readAsText(archivo);
});
