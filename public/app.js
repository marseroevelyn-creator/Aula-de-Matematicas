// =========================================================================
// 🌐 CONTROL GLOBAL DE ESTADOS - AULA DE MATEMÁTICAS
// =========================================================================
let cursoActualId = null;
let bancoTareasCache = [];
let listaAlumnosCache = [];

// --- MANEJO VISUAL DE CONTRASEÑA ("OJO") ---
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

// --- SISTEMA DE AUTOCOMPLETADO PREDICTIVO PARA LOGIN ---
async function precargarUsuariosParaLogin() {
    try {
        const res = await fetch('/api/usuarios');
        const usuarios = await res.json();
        listaAlumnosCache = usuarios.filter(u => u.rol === 'alumno').map(u => u.username);
    } catch (err) {
        console.error("No se pudieron precargar los usuarios:", err);
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
// 🔑 PROCESAMIENTO CENTRAL DE AUTENTICACIÓN (LOGIN)
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
        alert("El servidor local está desconectado o cargando.");
    }
});

async function procesarCambioClave() {
    const nuevaClave = document.getElementById('nueva-clave-input').value.trim();
    if (nuevaClave.length < 4) {
        alert("Por seguridad, la nueva contraseña debe tener al menos 4 dígitos.");
        return;
    }

    const res = await fetch('/api/auth/cambiar-clave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevaClave })
    });
    const data = await res.json();

    if (data.success) {
        alert("¡Contraseña actualizada con éxito!");
        document.getElementById('section-cambio-clave').classList.add('hidden');
        document.getElementById('section-alumno').classList.remove('hidden');
        cargarDashboardEstudiante();
    } else {
        alert("Error al actualizar contraseña.");
    }
}

function cerrarSesion() {
    location.reload();
}

// =========================================================================
// 📂 PANEL DOCENTE: GESTIÓN DE CURSOS (EDITAR Y BORRAR DESDE DESPLEGABLE)
// =========================================================================
async function inicializarPanelProfesora() {
    await cargarCursosProfesor();
    await cargarBancoGlobalTareas();
}

async function cargarCursosProfesor() {
    const res = await fetch('/api/cursos');
    const cursos = await res.json();
    const listaCursosDiv = document.getElementById('lista-cursos-render');
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
                <small class="text-muted">${c.whatsapp_link ? `🟢 Link WhatsApp Activo` : `❌ Sin enlace`}</small>
            </div>
            <div class="dropdown">
                <button class="btn-secondary btn-sm" onclick="toggleDropdownMenu(event, ${c.id})">⚙️ Opciones ▾</button>
                <div id="dropdown-curso-${c.id}" class="dropdown-content hidden" style="position: absolute; right: 0; background: white; border: 1px solid #ccc; z-index: 100;">
                    <button onclick="modalEditarCurso(${c.id}, '${c.nombre}', '${c.whatsapp_link || ''}')">✏️ Editar Nombre/Link</button>
                    <button onclick="eliminarCursoCompleto(${c.id})" class="text-danger">🗑️ Eliminar Curso</button>
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
    const nombre = prompt("Nombre del nuevo curso (Ej: 4to Año A):");
    if (!nombre) return;
    const whatsapp_link = prompt("Pegá el link de WhatsApp (Opcional):") || "";

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
    const nuevoLink = prompt("Modificar enlace de WhatsApp:", linkActual);

    await fetch(`/api/cursos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoNombre, whatsapp_link: nuevoLink })
    });
    cargarCursosProfesor();
}

async function eliminarCursoCompleto(id) {
    if (!confirm("⚠️ ¿Estás seguro de eliminar este curso? Se desvincularán alumnos y asignaciones.")) return;
    await fetch(`/api/cursos/${id}`, { method: 'DELETE' });
    cargarCursosProfesor();
    if(cursoActualId === id) {
        document.getElementById('modulo-gestion-curso-activo').classList.add('hidden');
    }
}

// =========================================================================
// 👥 PANEL DOCENTE: ALUMNOS (EDITAR, REINICIAR Y ASIGNACIONES INDIVIDUALES)
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
    const contenedor = document.getElementById('lista-alumnos-render');
    contenedor.innerHTML = '';

    alumnos.forEach(alu => {
        const item = document.createElement('div');
        item.className = 'item-lista-admin';
        item.innerHTML = `
            <div>
                <strong>👤 ${alu.username}</strong>
                <span class="badge bg-primary">${alu.progreso}%</span>
            </div>
            <div>
                <button class="btn-secondary btn-sm" onclick="gestionarExcepcionesAlumno(${alu.id}, '${alu.username}')" title="Asignar/Excluir tareas a mano">🎯 Individual</button>
                <button class="btn-secondary btn-sm" onclick="editarNombreAlumno(${alu.id}, '${alu.username}')">✏️</button>
                <button class="btn-secondary btn-sm" onclick="reiniciarClaveAlumno(${alu.id})">🔑</button>
                <button class="btn-danger btn-sm" onclick="eliminarAlumnoCompleto(${alu.id})">🗑️</button>
            </div>
        `;
        contenedor.appendChild(item);
    });
}

async function agregarAlumnoAlCurso() {
    if (!cursoActualId) return;
    const username = prompt("Nombre completo del nuevo alumno/a:");
    if (!username) return;

    const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'usuario', rol: 'alumno', curso_id: cursoActualId })
    });
    if (res.ok) {
        alert("Registrado. Clave inicial: 'usuario'.");
        cargarAlumnosDelCurso();
    }
}

async function editarNombreAlumno(id, nombreActual) {
    const nuevoNombre = prompt("Modificar nombre completo:", nombreActual);
    if (!nuevoNombre || nuevoNombre.trim() === '') return;

    await fetch(`/api/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nuevoNombre, curso_id: cursoActualId })
    });
    cargarAlumnosDelCurso();
}

async function reiniciarClaveAlumno(id) {
    if(!confirm("¿Deseas restablecer la contraseña a 'usuario'?")) return;
    await fetch(`/api/usuarios/${id}/reiniciar`, { method: 'POST' });
    alert("Contraseña restablecida.");
}

async function eliminarAlumnoCompleto(id) {
    if(!confirm("¿Eliminar alumno permanentemente?")) return;
    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    cargarAlumnosDelCurso();
}

// 🎯 CONTROL INDIVIDUAL: ASIGNAR O EXCLUIR ACTIVIDADES "A MANO"
async function gestionarExcepcionesAlumno(alumnoId, alumnoNombre) {
    let listado = "Modificar tareas para: " + alumnoNombre + "\n\n";
    listado += "Escribí el ID de la tarea y luego la acción.\nDisponibles actualmente en el banco:\n";
    
    bancoTareasCache.forEach(t => {
        listado += `ID: ${t.id} - [${t.carpeta}] ${t.titulo}\n`;
    });
    
    const tareaId = prompt(listado + "\nIngresá el ID numérico de la tarea a gestionar:");
    if(!tareaId) return;
    
    const accion = prompt("Escribí:\n'asignar' (para forzar su entrega)\n'excluir' (para sacársela solo a él)\n'eliminar' (quitar registro)");
    if(!accion) return;

    const res = await fetch('/api/asignaciones/individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumno_id: parseInt(tareaId) ? alumnoId : alumnoId, tarea_id: parseInt(tareaId), estado: accion })
    });
    if(res.ok) {
        alert("Cambio individual aplicado.");
        cargarAlumnosDelCurso();
    }
}

// =========================================================================
// 📝 PANEL DOCENTE: BANCO GLOBAL Y ACCIONES DE EDICIÓN DE TAREAS
// =========================================================================
async function cargarBancoGlobalTareas() {
    const res = await fetch('/api/tareas');
    bancoTareasCache = await res.json();
    filtrarYRenderizarBancoTareas();
}

function filtrarYRenderizarBancoTareas() {
    const busqueda = document.getElementById('buscador-banco-tareas').value.toLowerCase();
    const contenedor = document.getElementById('banco-tareas-render');
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
                    <small class="text-muted">ID: ${t.id} | ${t.requiere_entrega ? '📝 Adjunto obligatorio' : '👁️ Marcar Visto'}</small>
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

// EDITAR O CREAR TAREAS DINÁMICAMENTE (REPARADO CON FORM DATA MULTIPART)
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
        alert(id ? "¡Tarea editada y actualizada en el Banco!" : "Tarea guardada con éxito.");
        e.target.reset();
        document.getElementById('form-tarea-id').value = '';
        document.getElementById('btn-guardar-tarea').textContent = 'Crear y Guardar Tarea';
        await cargarBancoGlobalTareas();
        if(cursoActualId) await actualizarTablaTareasAsignadas();
    } else {
        alert("Error al procesar la operación.");
    }
});

function cargarTareaEnFormularioEdicion(id) {
    const tarea = bancoTareasCache.find(t => t.id === id);
    if(!tarea) return;

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

    document.getElementById('btn-guardar-tarea').textContent = '💾 Guardar Cambios Editados';
    document.getElementById('form-crear-tarea').scrollIntoView({ behavior: 'smooth' });
}

async function eliminarTareaDelBanco(id) {
    if(!confirm("¿Eliminar del banco? Desaparecerá de todos los cursos.")) return;
    await fetch(`/api/tareas/${id}`, { method: 'DELETE' });
    await cargarBancoGlobalTareas();
    if(cursoActualId) await actualizarTablaTareasAsignadas();
}

async function asignarTareaAlCursoActual(tareaId) {
    if (!cursoActualId) {
        alert("Primero seleccioná un curso a la izquierda.");
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
    if(!confirm("¿Desvincular esta tarea del grupo?")) return;
    await fetch(`/api/asignaciones/curso/${cursoActualId}/tarea/${tareaId}`, { method: 'DELETE' });
    await actualizarTablaTareasAsignadas();
    await cargarAlumnosDelCurso();
}

async function actualizarTablaTareasAsignadas() {
    if (!cursoActualId) return;
    const res = await fetch(`/api/cursos/${cursoActualId}/tareas`);
    const tareas = await res.json();
    const contenedor = document.getElementById('tabla-tareas-asignadas');
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
// 📥 PANEL DOCENTE: REVISIÓN DE ENTREGAS Y CORRECCIÓN / REASIGNACIÓN
// =========================================================================
async function verEntregasDeTareaActiva(tareaId, tituloTarea) {
    document.getElementById('nombre-tarea-revision-cabecera').textContent = tituloTarea;
    const res = await fetch(`/api/asignaciones/tarea/${tareaId}/entregas`);
    const entregas = await res.json();
    const contenedor = document.getElementById('tabla-entregas-render');
    contenedor.innerHTML = '';

    if(entregas.length === 0) {
        contenedor.innerHTML = `<p class="text-muted" style="padding:15px;">Sin movimientos de alumnos para esta actividad.</p>`;
        return;
    }

    entregas.forEach(ent => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style = "border: 1px solid var(--border-color); margin-bottom:10px; padding:15px; background: #fff;";
        
        let estadoEnvio = ent.completada ? '✅ Aprobada / Lista' : '⏳ Pendiente de Revisión';
        if(!ent.completada && ent.visto && !ent.archivo_entrega_url) estadoEnvio = '👁️ Solo Visualizada';

        card.innerHTML = `
            <h5>👤 Estudiante: ${ent.alumno_nombre}</h5>
            <p>Condición: <strong>${estadoEnvio}</strong></p>
            ${ent.archivo_entrega_url ? `<p>📎 Adjunto: <a href="${ent.archivo_entrega_url}" target="_blank" class="btn-primary btn-sm" style="display:inline-block; margin-top:5px; text-decoration:none; padding:4px 8px; border-radius:4px;">Abrir Resolución</a></p>` : '<p class="text-muted">No lleva archivo adjunto.</p>'}
            
            <div style="margin-top:12px; display:flex; gap:8px;">
                <button onclick="enviarCalificacionAEstudiante(${ent.id}, true)" class="btn-success btn-sm">Aprobar</button>
                <button onclick="reasignarTareaAlumno(${ent.id})" class="btn-danger btn-sm">❌ Reasignar (Rehacer)</button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

async function enviarCalificacionAEstudiante(asignacionId, completada) {
    const devolucion = prompt("Comentario o devolución para el alumno (Opcional):") || "Aprobado por la profesora.";
    await fetch(`/api/asignaciones/${asignacionId}/corregir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devolucion, completada })
    });
    alert("Calificación guardada.");
    location.reload();
}

// 🔄 NUEVO REQUERIMIENTO: PERMITIR AL ALUMNO REHACER LA ACTIVIDAD SI HIZO MAL
async function reasignarTareaAlumno(asignacionId) {
    const motivo = prompt("Indicá qué errores cometió. Se habilitará el casillero para que la envíe de nuevo:");
    if (motivo === null) return;
    
    const res = await fetch(`/api/asignaciones/${asignacionId}/reasignar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo })
    });
    const data = await res.json();
    if (data.success) {
        alert("Tarea reasignada. Se borró la entrega errónea del panel del alumno.");
        location.reload();
    }
}

// =========================================================================
// 🎓 FEED ALUMNO: RENDERIZADO EVALUANDO PRERREQUISITOS Y TEMAS EN EL ÍNDICE
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
            areaWhatsapp.innerHTML = `<a href="${data.curso.whatsapp_link}" target="_blank" class="btn-success" style="text-decoration:none; padding:6px 12px; display:inline-block; border-radius:5px; font-weight:bold;">💬 Entrar al WhatsApp del Curso</a>`;
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

    // 📂 REPARACIÓN: OBTENER Y MAPEAR TEMAS EN LA BARRA LATERAL (NO QUEDA VACÍO)
    const temasUnicos = [...new Set(data.tareas.map(t => t.carpeta))];
    if(temasUnicos.length === 0 || data.tareas.length === 0) {
        contenedorIndice.innerHTML = `<p class="text-muted" style="font-size:13px; padding:5px;">Sin unidades cargadas.</p>`;
    } else {
        temasUnicos.forEach(tema => {
            const itemTema = document.createElement('div');
            itemTema.className = 'item-indice-lateral';
            itemTema.style = "padding: 8px; border-bottom: 1px solid var(--border-color); font-size:14px; color: var(--secondary); font-weight: 500;";
            itemTema.innerHTML = `📁 ${tema}`;
            contenedorIndice.appendChild(itemTema);
        });
    }

    // 📑 REPARACIÓN: EVALUAR PRERREQUISITO REAL (EVITA VER LA ÚLTIMA TAREA DIRECTAMENTE)
    data.tareas.forEach(tarea => {
        // Si la tarea depende de otra anterior y esa anterior NO está marcada como completada, se oculta temporalmente del listado
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
                        <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px;">Subir trabajo resuelto:</label>
                        <input type="file" name="archivo" required style="font-size:13px; display:block; margin-bottom:8px;">
                        <button type="submit" class="btn-primary btn-sm">Subir y Entregar</button>
                    </form>
                `;
            } else {
                bloqueEntregaHtml = `
                    <button onclick="marcarTareaComoVistaEstudiante(${tarea.asignacion_id}, '${tarea.enlace_externo || ''}')" class="btn-success btn-sm" style="margin-top:10px;">
                        ${tarea.enlace_externo && tarea.enlace_externo.includes('youtube') ? '📺 Marcar video visto' : '✔️ Completar Actividad'}
                    </button>
                `;
            }
        }

        divTarea.innerHTML = `
            <span class="text-muted" style="font-size:11px; font-weight:bold; text-transform:uppercase;">🏷️ Unidad: ${tarea.carpeta}</span>
            <h4 style="margin:2px 0 8px 0; color:var(--primary);">${tarea.titulo}</h4>
            <p style="font-size:14px; margin-bottom:10px;">${tarea.descripcion || 'Sin descripción provista.'}</p>
            
            ${tarea.enlace_externo ? `<p>🔗 Enlace complementario: <a href="${tarea.enlace_externo}" target="_blank" onclick="alertarAuricularesSiEsVideo('${tarea.enlace_externo}')" style="color:var(--info); font-weight:bold;">Abrir enlace externo</a></p>` : ''}
            ${tarea.archivo_url ? `<p>📁 Documento de la profesora: <a href="${tarea.archivo_url}" target="_blank" style="color:var(--primary);">Descargar PDF / Imagen</a></p>` : ''}
            ${tarea.devolucion ? `<div style="background:#fef2f2; border-left:4px solid var(--danger); padding:8px; margin-top:10px; font-size:13px; color:#991b1b;">📢 <strong>Nota de Corrección:</strong> ${tarea.devolucion}</div>` : ''}
            
            ${bloqueEntregaHtml}
        `;

        if (tarea.completada || tarea.visto) {
            contenedorViejas.appendChild(divTarea);
        } else {
            contenedorUrgentes.appendChild(divTarea);
        }
    });

    if(contenedorUrgentes.innerHTML === '') {
        contenedorUrgentes.innerHTML = `<p class="text-muted">🎉 ¡Felicidades! Completaste todas las tareas de las unidades desbloqueadas.</p>`;
    }
}

function alertarAuricularesSiEsVideo(url) {
    if(url.includes('youtube') || url.includes('youtu.be') || url.includes('vimeo') || url.includes('.mp4')) {
        alert("🎧 Recordá usar auriculares si estás adentro del salón de clases.");
    }
}

async function entregarArchivoTareaEstudiante(e, asignacionId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = "Cargando archivo...";

    const res = await fetch(`/api/asignaciones/${asignacionId}/entregar`, {
        method: 'POST',
        body: formData
    });
    if(res.ok) {
        alert("¡Trabajo enviado con éxito!");
        cargarDashboardEstudiante();
    } else {
        alert("Ocurrió un error.");
        btn.disabled = false;
    }
}

async function marcarTareaComoVistaEstudiante(asignacionId, enlaceExterno) {
    if(enlaceExterno) alertarAuricularesSiEsVideo(enlaceExterno);
    await fetch(`/api/asignaciones/${asignacionId}/visto`, { method: 'POST' });
    cargarDashboardEstudiante();
}

// =========================================================================
// 🤖 INTERACCIÓN CON CHAT BOT (GEMINI IA)
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
// 📅 FECHAS IMPORTANTES Y RESPALDOS
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
    if (!confirm("⚠️ ¿Restaurar este respaldo?")) return;
    
    const lector = new FileReader();
    lector.onload = async (e) => {
        try {
            const datosJSON = JSON.parse(e.target.result);
            const res = await fetch('/api/sistema/restaurar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosJSON)
            });
            if (res.ok) { alert("🎉 Sistema restaurado."); location.reload(); }
        } catch (err) { alert("Archivo inválido."); }
    };
    lector.readAsText(archivo);
}

// --- ARRANQUE AUTOMÁTICO AL INICIAR LA PLATAFORMA ---
precargarUsuariosParaLogin();
if(document.getElementById('lista-fechas-render')) {
    cargarFechasImportantes();
}
