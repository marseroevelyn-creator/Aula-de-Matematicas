// =========================================================================
// VARIABLES GLOBALES DE CONTROL
// =========================================================================
let cursoActualId = null;
let bancoTareasCache = [];
let listaAlumnosCache = [];

// --- MOSTRAR / OCULTAR CONTRASEÑA ---
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

// --- TEXTO PREDICTIVO AUTOCOMPLETADO EN LOGIN ---
async function precargarUsuariosParaLogin() {
    try {
        const res = await fetch('/api/usuarios');
        const usuarios = await res.json();
        listaAlumnosCache = usuarios.filter(u => u.rol === 'alumno').map(u => u.username);
    } catch (err) {
        console.error("Error al precargar usuarios:", err);
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

    const filtrados = listaAlumnosCache.filter(name => name.toLowerCase().includes(texto));

    if (filtrados.length === 0) {
        cajaSugerencias.innerHTML = '';
        cajaSugerencias.classList.add('hidden');
        return;
    }

    cajaSugerencias.innerHTML = '';
    filtrados.forEach(nombre => {
        const div = document.createElement('div');
        div.className = 'sugerencia-item';
        div.textContent = nombre;
        div.onclick = () => {
            document.getElementById('login-username').value = nombre;
            cajaSugerencias.innerHTML = '';
            cajaSugerencias.classList.add('hidden');
        };
        cajaSugerencias.appendChild(div);
    });
    cajaSugerencias.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
    if (e.target.id !== 'login-username') {
        const caja = document.getElementById('login-sugerencias');
        if(caja) caja.classList.add('hidden');
    }
});

// =========================================================================
// AUTENTICACIÓN (LOGIN) Y LOGOUT
// =========================================================================
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
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
                inicializarPanelProfesora();
            } else {
                if (data.debeCambiar) {
                    document.getElementById('section-cambio-clave').classList.remove('hidden');
                } else {
                    document.getElementById('section-alumno').classList.remove('hidden');
                    cargarDashboardEstudiante();
                }
            }
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        alert("El servidor no responde o está cargando.");
    }
});

async function procesarCambioClave() {
    const nuevaClave = document.getElementById('nueva-clave-input').value.trim();
    if (nuevaClave.length < 4) {
        alert("La contraseña debe tener al menos 4 caracteres por seguridad.");
        return;
    }

    const res = await fetch('/api/auth/cambiar-clave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevaClave })
    });
    const data = await res.json();

    if (data.success) {
        alert("¡Contraseña guardada!");
        document.getElementById('section-cambio-clave').classList.add('hidden');
        document.getElementById('section-alumno').classList.remove('hidden');
        cargarDashboardEstudiante();
    } else {
        alert("Error al cambiar la clave.");
    }
}

function cerrarSesion() {
    location.reload();
}

// =========================================================================
// GESTIÓN DE CURSOS (INCLUYE EDITAR Y BORRAR DESDE MENÚ DESPLEGABLE)
// =========================================================================
async function inicializarPanelProfesora() {
    await cargarCursosProfesor();
    await cargarBancoGlobalTareas();
}

async function cargarCursosProfesor() {
    const res = await fetch('/api/cursos');
    const cursos = await res.json();
    const listaCursosDiv = document.getElementById('admin-cursos-lista');
    if(!listaCursosDiv) return;
    listaCursosDiv.innerHTML = '';

    const selectorFiltro = document.getElementById('selector-curso-tareas');
    const selectorAlumnos = document.getElementById('selector-curso-alumnos');
    
    if(selectorFiltro) selectorFiltro.innerHTML = '<option value="">-- Selecciona un Curso --</option>';
    if(selectorAlumnos) selectorAlumnos.innerHTML = '<option value="">-- Selecciona un Curso --</option>';

    cursos.forEach(c => {
        if(selectorFiltro) selectorFiltro.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        if(selectorAlumnos) selectorAlumnos.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;

        const card = document.createElement('div');
        card.className = 'item-lista-admin';
        card.style.position = 'relative';
        card.innerHTML = `
            <div style="cursor: pointer; flex-grow: 1;" onclick="seleccionarCursoActivo(${c.id}, '${c.nombre}')">
                <strong>📌 ${c.nombre}</strong><br>
                <small class="text-muted">${c.whatsapp_link ? `🟢 Link WhatsApp Asignado` : `❌ Sin link de WhatsApp`}</small>
            </div>
            <div class="dropdown">
                <button class="btn-secondary btn-sm" onclick="toggleDropdownMenu(event, ${c.id})">⚙️ Opciones ▾</button>
                <div id="dropdown-curso-${c.id}" class="dropdown-content hidden" style="position: absolute; right: 0; background: white; border: 1px solid #ccc; z-index: 100; min-width: 160px; box-shadow: 0px 4px 6px rgba(0,0,0,0.1);">
                    <button onclick="modalEditarCurso(${c.id}, '${c.nombre}', '${c.whatsapp_link || ''}')" style="width:100%; text-align:left; padding:8px; background:none; border:none; cursor:pointer;">✏️ Editar Nombre/Link</button>
                    <button onclick="eliminarCursoCompleto(${c.id})" class="text-danger" style="width:100%; text-align:left; padding:8px; background:none; border:none; cursor:pointer;">🗑️ Eliminar Curso</button>
                </div>
            </div>
        `;
        listaCursosDiv.appendChild(card);
    });
}

function toggleDropdownMenu(event, cursoId) {
    event.stopPropagation();
    document.querySelectorAll('.dropdown-content').forEach(el => {
        if(el.id !== `dropdown-curso-${cursoId}`) el.classList.add('hidden');
    });
    const menu = document.getElementById(`dropdown-curso-${cursoId}`);
    if(menu) menu.classList.toggle('hidden');
}

window.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-content').forEach(el => el.classList.add('hidden'));
});

async function crearCursoNuevo() {
    const nombre = prompt("Nombre del curso (Ej: 4to Año B):");
    if (!nombre) return;
    const whatsapp_link = prompt("Link de invitación de WhatsApp (Opcional):") || "";

    await fetch('/api/cursos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, whatsapp_link })
    });
    cargarCursosProfesor();
}

async function modalEditarCurso(id, nombreActual, linkActual) {
    const nuevoNombre = prompt("Modificar nombre del curso:", nombreActual);
    if (!nuevoNombre) return;
    const nuevoLink = prompt("Modificar link de invitación de WhatsApp:", linkActual);

    await fetch(`/api/cursos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoNombre, whatsapp_link: nuevoLink })
    });
    cargarCursosProfesor();
}

async function eliminarCursoCompleto(id) {
    if (!confirm("⚠️ ¿Estás seguro de borrar este curso por completo? Desvinculará a todos sus alumnos y asignaciones.")) return;
    await fetch(`/api/cursos/${id}`, { method: 'DELETE' });
    cargarCursosProfesor();
    if(cursoActualId === id) {
        document.getElementById('modulo-gestion-curso-activo').classList.add('hidden');
    }
}

// =========================================================================
// GESTIÓN DE ALUMNOS (EDITAR, REINICIAR Y CAMBIOS INDIVIDUALES DE ACTIVIDADES)
// =========================================================================
async function seleccionarCursoActivo(id, nombre) {
    cursoActualId = id;
    document.getElementById('modulo-gestion-curso-activo').classList.remove('hidden');
    document.getElementById('nombre-curso-cabecera-admin').textContent = nombre;
    
    await cargarAlumnosDelCurso();
    await actualizarTablaTareasAsignadas();
}

async function cargarAlumnosDelCurso() {
    if (!cursoActualId) return;
    const res = await fetch(`/api/cursos/${cursoActualId}/alumnos-progreso`);
    const alumnos = await res.json();
    const contenedor = document.getElementById('admin-alumnos-lista');
    if(!contenedor) return;
    contenedor.innerHTML = '';

    alumnos.forEach(alu => {
        const item = document.createElement('div');
        item.className = 'item-lista-admin';
        item.innerHTML = `
            <div>
                <strong>👤 ${alu.username}</strong>
                <span class="badge bg-primary">${alu.progreso}% completado</span>
            </div>
            <div>
                <button class="btn-secondary btn-sm" onclick="gestionarActividadesIndividuales(${alu.id}, '${alu.username}')" title="Asignar/Excluir tareas de forma individual">🎯 Individual</button>
                <button class="btn-secondary btn-sm" onclick="editarNombreAlumno(${alu.id}, '${alu.username}')">✏️ Editar</button>
                <button class="btn-secondary btn-sm" onclick="reiniciarClaveAlumno(${alu.id})">🔑 Clave</button>
                <button class="btn-danger btn-sm" onclick="eliminarAlumnoCompleto(${alu.id})">🗑️</button>
            </div>
        `;
        contenedor.appendChild(item);
    });
}

async function agregarAlumnoAlCurso() {
    if (!cursoActualId) return;
    const username = prompt("Nombre y apellido del alumno/a:");
    if (!username) return;

    const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'usuario', rol: 'alumno', curso_id: cursoActualId })
    });
    if (res.ok) {
        alert("Alumno guardado. Su contraseña provisional es 'usuario'.");
        cargarAlumnosDelCurso();
    }
}

async function editarNombreAlumno(id, nombreActual) {
    const nuevoNombre = prompt("Corregir nombre completo:", nombreActual);
    if (!nuevoNombre || nuevoNombre.trim() === '') return;

    await fetch(`/api/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nuevoNombre, curso_id: cursoActualId })
    });
    cargarAlumnosDelCurso();
}

async function reiniciarClaveAlumno(id) {
    if(!confirm("¿Querés reestablecer la contraseña de este estudiante a 'usuario'?")) return;
    await fetch(`/api/usuarios/${id}/reiniciar`, { method: 'POST' });
    alert("Contraseña blanqueada con éxito.");
}

async function eliminarAlumnoCompleto(id) {
    if(!confirm("¿Eliminar definitivamente a este alumno del sistema?")) return;
    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    cargarAlumnosDelCurso();
}

// 🎯 ACCIONES INDIVIDUALES (ASIGNAR/EXCLUIR ACTIVIDADES A UN ALUMNO DETERMINADO)
async function gestionarActividadesIndividuales(alumnoId, alumnoNombre) {
    let msg = `Panel de Excepciones para: ${alumnoNombre.toUpperCase()}\n\n`;
    msg += "Ingresá el ID numérico de la tarea que querés modificar:\n";
    bancoTareasCache.forEach(t => {
        msg += `👉 ID [ ${t.id} ] - (${t.carpeta}) ${t.titulo}\n`;
    });

    const tareaIdStr = prompt(msg);
    const tId = parseInt(tareaIdStr);
    if(isNaN(tId)) return;

    const accion = prompt("Escribí la acción que querés realizar:\n'asignar' (Fuerza la tarea en su panel)\n'excluir' (Le saca la tarea de su panel)\n'eliminar' (Quita la regla especial)");
    if(!accion || (accion !== 'asignar' && accion !== 'excluir' && accion !== 'eliminar')) {
        alert("Acción no válida.");
        return;
    }

    const res = await fetch('/api/asignaciones/individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumno_id: alumnoId, tarea_id: tId, estado: accion })
    });
    if(res.ok) {
        alert("Excepción individual configurada correctamente.");
        cargarAlumnosDelCurso();
    }
}

// =========================================================================
// BANCO GLOBAL Y ACCIONES DE EDICIÓN DE TAREAS CRUCIALES
// =========================================================================
async function cargarBancoGlobalTareas() {
    const res = await fetch('/api/tareas');
    bancoTareasCache = await res.json();
    filtrarYRenderizarBancoTareas();
}

function filtrarYRenderizarBancoTareas() {
    const busqueda = document.getElementById('buscador-banco-tareas').value.toLowerCase();
    const contenedor = document.getElementById('banco-tareas-render');
    if(!contenedor) return;
    contenedor.innerHTML = '';

    const selectorPre = document.getElementById('form-tarea-prerrequisito');
    if(selectorPre) selectorPre.innerHTML = '<option value="null">Ninguno (Actividad Libre)</option>';

    bancoTareasCache.forEach(t => {
        if(selectorPre) selectorPre.innerHTML += `<option value="${t.id}">${t.titulo} (${t.carpeta})</option>`;

        if (t.titulo.toLowerCase().includes(busqueda) || t.carpeta.toLowerCase().includes(busqueda)) {
            const item = document.createElement('div');
            item.className = 'item-lista-admin';
            item.innerHTML = `
                <div style="flex-grow: 1;">
                    <strong>📂 [${t.carpeta}] - ${t.titulo}</strong><br>
                    <small class="text-muted">ID Tarea: ${t.id} | ${t.requiere_entrega ? '📝 Requiere adjuntar archivo' : '👁️ Solo ver material'}</small>
                </div>
                <div>
                    <button class="btn-primary btn-sm" onclick="asignarTareaAlCursoActual(${t.id})">+ Asignar</button>
                    <button class="btn-secondary btn-sm" onclick="cargarTareaEnFormularioEdicion(${t.id})">✏️ Editar</button>
                    <button class="btn-danger btn-sm" onclick="eliminarTareaDelBanco(${t.id})">🗑️</button>
                </div>
            `;
            contenedor.appendChild(item);
        }
    });
}

// PROCESAR FORMULARIO (DETECTA DINÁMICAMENTE SI CREA O EDITA CON PUT)
document.getElementById('form-crear-tarea').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('form-tarea-id').value;
    const formData = new FormData(e.target);

    const url = id ? `/api/tareas/${id}` : '/api/tareas';
    const metodo = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: metodo,
        body: formData
    });

    if (res.ok) {
        alert(id ? "¡Tarea editada con éxito en el Banco Global!" : "Tarea añadida al repositorio.");
        e.target.reset();
        document.getElementById('form-tarea-id').value = '';
        document.getElementById('btn-guardar-tarea').textContent = 'Crear y Guardar Tarea';
        await cargarBancoGlobalTareas();
        if(cursoActualId) await actualizarTablaTareasAsignadas();
    } else {
        alert("Ocurrió un inconveniente al guardar la actividad.");
    }
});

function cargarTareaEnFormularioEdicion(id) {
    const tarea = bancoTareasCache.find(t => t.id === id);
    if(!tarea) return;

    // Poblar campos de tu formulario
    document.getElementById('form-tarea-id').value = tarea.id;
    document.getElementById('form-tarea-titulo').value = tarea.titulo;
    document.getElementById('form-tarea-descripcion').value = tarea.descripcion || '';
    document.getElementById('form-tarea-carpeta').value = tarea.carpeta;
    document.getElementById('form-tarea-enlace').value = tarea.enlace_externo || '';
    document.getElementById('form-tarea-entrega').value = tarea.requiere_entrega ? 'true' : 'false';
    document.getElementById('form-tarea-prerrequisito').value = tarea.prerrequisito_id || 'null';
    
    if(tarea.fecha_entrega) {
        document.getElementById('form-tarea-fecha').value = tarea.fecha_entrega.substring(0,16);
    }

    // Cambiar texto de ejecución y hacer scroll suave al panel superior
    document.getElementById('btn-guardar-tarea').textContent = '💾 Guardar Cambios de la Tarea';
    document.getElementById('form-crear-tarea').scrollIntoView({ behavior: 'smooth' });
}

async function eliminarTareaDelBanco(id) {
    if(!confirm("¿Eliminar la tarea definitivamente del banco de recursos global?")) return;
    await fetch(`/api/tareas/${id}`, { method: 'DELETE' });
    await cargarBancoGlobalTareas();
    if(cursoActualId) await actualizarTablaTareasAsignadas();
}

async function asignarTareaAlCursoActual(tareaId) {
    if (!cursoActualId) {
        alert("Por favor, marcá primero un curso en el listado izquierdo.");
        return;
    }
    await fetch('/api/asignaciones/asignar-grupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curso_id: cursoActualId, tarea_id: tareaId })
    });
    await actualizarTablaTareasAsignadas();
    await cargarAlumnosDelCurso();
}

async function desasignarTareaDelCurso(tareaId) {
    if(!confirm("¿Remover esta actividad del grupo de alumnos de este curso?")) return;
    await fetch(`/api/asignaciones/curso/${cursoActualId}/tarea/${tareaId}`, { method: 'DELETE' });
    await actualizarTablaTareasAsignadas();
    await cargarAlumnosDelCurso();
}

async function actualizarTablaTareasAsignadas() {
    if (!cursoActualId) return;
    const res = await fetch(`/api/cursos/${cursoActualId}/tareas`);
    const tareas = await res.json();
    const contenedor = document.getElementById('tabla-tareas-cuerpo');
    if(!contenedor) return;
    contenedor.innerHTML = '';

    tareas.forEach(t => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>📁 ${t.carpeta}</td>
            <td><strong>${t.titulo}</strong></td>
            <td><span class="badge bg-secondary">${t.prerrequisito_titulo || 'Ninguno'}</span></td>
            <td>
                <button class="btn-danger btn-sm" onclick="desasignarTareaDelCurso(${t.id})">Quitar</button>
                <button class="btn-primary btn-sm" onclick="verEntregasDeTareaActiva(${t.id}, '${t.titulo}')">📥 Entregas</button>
            </td>
        `;
        contenedor.appendChild(fila);
    });
}

// =========================================================================
// CORRECCIÓN Y REASIGNACIÓN DE ENTREGAS MAL REALIZADAS
// =========================================================================
async function verEntregasDeTareaActiva(tareaId, tituloTarea) {
    document.getElementById('nombre-tarea-revision-cabecera').textContent = tituloTarea;
    const res = await fetch(`/api/asignaciones/tarea/${tareaId}/entregas`);
    const entregas = await res.json();
    const contenedor = document.getElementById('tabla-entregas-render');
    if(!contenedor) return;
    contenedor.innerHTML = '';

    if(entregas.length === 0) {
        contenedor.innerHTML = `<p class="text-muted" style="padding:15px;">Aún no hay respuestas o marcas de visualización de los alumnos.</p>`;
        return;
    }

    entregas.forEach(ent => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style = "border: 1px solid var(--border-color); margin-bottom:10px; padding:15px; background:#fff;";
        
        let estadoEnvio = ent.completada ? '✅ Tarea Aprobada' : '⏳ Esperando Corrección';
        if(!ent.completada && ent.visto && !ent.archivo_entrega_url) estadoEnvio = '👁️ Marcó como visto';

        card.innerHTML = `
            <h5>👤 Alumno: ${ent.alumno_nombre}</h5>
            <p>Estado actual: <strong>${estadoEnvio}</strong></p>
            ${ent.archivo_entrega_url ? `<p>📎 Resolución: <a href="${ent.archivo_entrega_url}" target="_blank" class="btn-primary btn-sm" style="display:inline-block; margin-top:5px; text-decoration:none; padding:4px 8px; border-radius:4px;">Abrir archivo enviado</a></p>` : '<p class="text-muted">No requería archivo adjunto.</p>'}
            
            <div style="margin-top:12px; display:flex; gap:8px;">
                <button onclick="enviarCalificacionAEstudiante(${ent.id}, true)" class="btn-success btn-sm">Aprobar Actividad</button>
                <button onclick="reasignarTareaAlumno(${ent.id})" class="btn-danger btn-sm">❌ Reasignar (Hizo algo mal)</button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

async function enviarCalificacionAEstudiante(asignacionId, completada) {
    const devolucion = prompt("Añadí un comentario o corrección (Opcional):") || "Trabajo visado y aprobado.";
    await fetch(`/api/asignaciones/${asignacionId}/corregir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devolucion, completada })
    });
    alert("Devolución asentada.");
    location.reload();
}

// REASIGNAR ACTIVIDAD LIMPIANDO BLOQUEOS PARA PERMITIR REENTREGA
async function reasignarTareaAlumno(asignacionId) {
    const motivo = prompt("Explicá qué debe corregir el alumno. Se le reabrirá la opción para adjuntar de nuevo:");
    if (motivo === null) return; 
    
    const res = await fetch(`/api/asignaciones/${asignacionId}/reasignar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo })
    });
    const data = await res.json();
    if (data.success) {
        alert("Tarea reasignada. El alumno ya tiene el casillero limpio para volver a mandar.");
        location.reload();
    }
}

// =========================================================================
// INTERFAZ DEL ALUMNO (ÍNDICE DINÁMICO Y VALIDACIÓN DE PRERREQUISITOS)
// =========================================================================
async function cargarDashboardEstudiante() {
    const res = await fetch('/api/alumno/dashboard');
    if(!res.ok) return;
    const data = await res.json();

    document.getElementById('alumno-nombre-cabecera').textContent = data.usuario;
    document.getElementById('alumno-curso-nombre').textContent = data.curso.nombre;
    
    const areaWhatsapp = document.getElementById('alumno-whatsapp-container');
    if(areaWhatsapp) {
        if(data.curso.whatsapp_link) {
            areaWhatsapp.innerHTML = `<a href="${data.curso.whatsapp_link}" target="_blank" class="btn-success" style="text-decoration:none; padding:6px 12px; display:inline-block; border-radius:5px; font-weight:bold;">💬 Unirse al WhatsApp del Curso</a>`;
        } else {
            areaWhatsapp.innerHTML = '';
        }
    }

    renderizarPanelEstudiante(data);
}

function renderizarPanelEstudiante(data) {
    const contenedorIndice = document.getElementById('alumno-indice-temas');
    const contenedorUrgentes = document.getElementById('alumno-tareas-urgentes');
    const contenedorViejas = document.getElementById('alumno-tareas-viejas');
    
    if(!contenedorIndice) return;
    
    contenedorIndice.innerHTML = '';
    contenedorUrgentes.innerHTML = '';
    contenedorViejas.innerHTML = '';

    // 📂 REPARADO: SE CONSTRUYE EL ÍNDICE BASADO EN LAS CARPETAS ACTIVAS (YA NO QUEDA VACÍO)
    const temasUnicos = [...new Set(data.tareas.map(t => t.carpeta))];
    if(temasUnicos.length === 0) {
        contenedorIndice.innerHTML = `<p class="text-muted" style="font-size:13px; padding:5px;">No hay temas cargados.</p>`;
    } else {
        temasUnicos.forEach(tema => {
            const itemTema = document.createElement('div');
            itemTema.className = 'item-indice-lateral';
            itemTema.style = "padding:8px; border-bottom:1px solid var(--border-color); font-size:14px; font-weight:bold; color:var(--text-color);";
            itemTema.innerHTML = `📁 ${tema}`;
            contenedorIndice.appendChild(itemTema);
        });
    }

    // 📑 REPARADO: EVALUACIÓN DE PRERREQUISITO REAL (EVITA SALTAR DIRECTO A LA ÚLTIMA TAREA)
    data.tareas.forEach(tarea => {
        // Si tiene un prerrequisito fijado por el profesor y este NO fue aprobado, se oculta del panel activo
        if (tarea.prerrequisito_id && tarea.prerrequisito_completado === false) {
            return;
        }

        const divTarea = document.createElement('div');
        divTarea.className = 'card-tarea';
        divTarea.style = "border: 1px solid var(--border-color); padding:16px; margin-bottom:15px; border-radius:var(--radius); background:#fff;";
        
        let bloqueEntregaHtml = '';
        if (tarea.completada || tarea.visto) {
            bloqueEntregaHtml = `<p class="text-success" style="font-weight:bold; margin-top:10px;">✅ Actividad Completada</p>`;
        } else {
            if (tarea.requiere_entrega) {
                bloqueEntregaHtml = `
                    <form onsubmit="entregarArchivoTareaEstudiante(event, ${tarea.asignacion_id})" style="margin-top:10px; background:#f1f5f9; padding:10px; border-radius:6px;">
                        <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px;">Subir resolución de la actividad:</label>
                        <input type="file" name="archivo" required style="font-size:13px; display:block; margin-bottom:8px;">
                        <button type="submit" class="btn-primary btn-sm">📤 Subir y Entregar</button>
                    </form>
                `;
            } else {
                bloqueEntregaHtml = `
                    <button onclick="marcarTareaComoVistaEstudiante(${tarea.asignacion_id}, '${tarea.enlace_externo || ''}')" class="btn-success btn-sm" style="margin-top:10px;">
                        ${tarea.enlace_externo && tarea.enlace_externo.includes('youtube') ? '📺 Confirmar Video Visto' : '✔️ Marcar Hecho'}
                    </button>
                `;
            }
        }

        divTarea.innerHTML = `
            <span class="text-muted" style="font-size:11px; font-weight:bold;">🏷️ Tema: ${tarea.carpeta}</span>
            <h4 style="margin:2px 0 8px 0; color:var(--primary);">${tarea.titulo}</h4>
            <p style="font-size:14px; margin-bottom:10px;">${tarea.descripcion || 'Sin descripción.'}</p>
            
            ${tarea.enlace_externo ? `<p>🔗 Enlace de soporte: <a href="${tarea.enlace_externo}" target="_blank" onclick="alertarAuricularesSiEsVideo('${tarea.enlace_externo}')" style="color:var(--info); font-weight:bold;">Abrir material interactivo</a></p>` : ''}
            ${tarea.archivo_url ? `<p>📁 Adjunto de la Profesora: <a href="${tarea.archivo_url}" target="_blank" style="color:var(--primary);">Descargar Recurso</a></p>` : ''}
            ${tarea.devolucion ? `<div style="background:#fef2f2; border-left:4px solid var(--danger); padding:8px; margin-top:10px; font-size:13px; color:#991b1b;">📢 <strong>Indicación de la Profesora:</strong> ${tarea.devolucion}</div>` : ''}
            
            ${bloqueEntregaHtml}
        `;

        if (tarea.completada || tarea.visto) {
            contenedorViejas.appendChild(divTarea);
        } else {
            contenedorUrgentes.appendChild(divTarea);
        }
    });

    if(contenedorUrgentes.innerHTML === '') {
        contenedorUrgentes.innerHTML = `<p class="text-muted">🎉 Completaste todo el material disponible para este nivel.</p>`;
    }
}

function alertarAuricularesSiEsVideo(url) {
    if(url.includes('youtube') || url.includes('youtu.be') || url.includes('vimeo') || url.includes('.mp4')) {
        alert("🎧 Acordate de usar auriculares si estás resolviendo esto en el aula.");
    }
}

async function entregarArchivoTareaEstudiante(e, asignacionId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = "Enviando archivo...";

    const res = await fetch(`/api/asignaciones/${asignacionId}/entregar`, {
        method: 'POST',
        body: formData
    });
    if(res.ok) {
        alert("¡Entrega guardada con éxito!");
        cargarDashboardEstudiante();
    } else {
        alert("Error al cargar.");
        btn.disabled = false;
    }
}

async function marcarTareaComoVistaEstudiante(asignacionId, enlaceExterno) {
    if(enlaceExterno) alertarAuricularesSiEsVideo(enlaceExterno);
    await fetch(`/api/asignaciones/${asignacionId}/visto`, { method: 'POST' });
    cargarDashboardEstudiante();
}

// =========================================================================
// TUTORÍA INTELIGENTE: GEMINI IA
// =========================================================================
async function enviarMensajeGemini() {
    const input = document.getElementById('gemini-input-text');
    const prompt = input.value.trim();
    if (!prompt) return;

    const logs = document.getElementById('gemini-chat-logs');
    logs.innerHTML += `<div class="chat-msg user"><strong>Tú:</strong> ${prompt}</div>`;
    input.value = '';
    logs.scrollTop = logs.scrollHeight;

    const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    logs.innerHTML += `<div class="chat-msg ai"><strong>Tutor IA:</strong> ${data.respuesta}</div>`;
    logs.scrollTop = logs.scrollHeight;
}

// =========================================================================
// CRONOGRAMA DE FECHAS Y BACKUPS DEL SISTEMA
// =========================================================================
async function cargarFechasImportantes() {
    const res = await fetch('/api/fechas');
    const fechas = await res.json();
    const contenedor = document.getElementById('lista-fechas-render');
    if(contenedor) {
        contenedor.innerHTML = '';
        fechas.forEach(f => {
            const fFormateada = new Date(f.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
            contenedor.innerHTML += `
                <div class="item-lista-admin">
                    <span>📅 <strong>${fFormateada}</strong>: ${f.evento}</span>
                    <button class="btn-danger btn-sm" onclick="eliminarFechaImportante(${f.id})">🗑️</button>
                </div>`;
        });
    }
}

async function agregarFechaImportante() {
    const fecha = document.getElementById('form-fecha-calendario').value;
    const evento = document.getElementById('form-fecha-evento').value.trim();
    if(!fecha || !evento) return;

    await fetch('/api/fechas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, evento })
    });
    document.getElementById('form-fecha-evento').value = '';
    cargarFechasImportantes();
}

async function eliminarFechaImportante(id) {
    await fetch(`/api/fechas/${id}`, { method: 'DELETE' });
    cargarFechasImportantes();
}

async function subirCopiaSeguridad(input) {
    const archivo = input.files[0];
    if (!archivo) return;
    if (!confirm("⚠️ ¿Deseas sobreescribir los datos actuales con este backup?")) return;
    
    const lector = new FileReader();
    lector.onload = async (e) => {
        try {
            const datosJSON = JSON.parse(e.target.result);
            const res = await fetch('/api/sistema/restaurar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosJSON)
            });
            if (res.ok) { alert("Base de datos restaurada."); location.reload(); }
        } catch (err) { alert("Archivo no válido."); }
    };
    lector.readAsText(archivo);
}

// --- DISPARADORES DE ARRANQUE ---
precargarUsuariosParaLogin();
if(document.getElementById('lista-fechas-render')) {
    cargarFechasImportantes();
}
