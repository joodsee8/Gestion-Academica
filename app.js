// =================================================================
// 1. VARIABLES GLOBALES Y ALMACENAMIENTO
// =================================================================
let materias = JSON.parse(localStorage.getItem('malla_udeg')) || [];
let horarioActual = JSON.parse(localStorage.getItem('horario_udeg')) || [];
let ofertaAcademica = JSON.parse(localStorage.getItem('oferta_udeg')) || {};

let cursosGenerador = []; 
let todosLosResultados = [];
let resultadosMostrados = 0;

const DIAS_LETRA = ['L', 'M', 'I', 'J', 'V', 'S'];
const DIAS_NOMBRE = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const CREDITOS_TOTALES = 418;
const CREDITOS_DESBLOQUEO = 251;
let editandoNRC = null;

function guardarDatos() { localStorage.setItem('malla_udeg', JSON.stringify(materias)); }
function guardarHorario() { localStorage.setItem('horario_udeg', JSON.stringify(horarioActual)); }

// =================================================================
// 2. INICIO Y CARGA DE DATOS
// =================================================================
window.onload = function() {
    const carreraGuardada = localStorage.getItem('carreraSeleccionada') || 'INQU';
    const selector = document.getElementById('selectorCarrera');
    if(selector) selector.value = carreraGuardada;
    
    cambiarCatalogoCarrera(); 
    sanitizarDatosGuardados(); 
    procesarNormatividadYDependencias(); 
    actualizarVistas();
    
    if(Object.keys(ofertaAcademica).length > 0) {
        document.getElementById('estadoOferta').innerText = "Oferta en memoria lista.";
        cargarDatalistOferta();
    }
    renderizarHorario(); 
};

function sanitizarDatosGuardados() {
    let arreglado = false;
    materias.forEach(m => {
        if (m.prerequisito) {
            let padre = materias.find(p => p.nrc === m.prerequisito);
            if (padre && padre.prerequisito === m.nrc) { m.prerequisito = ''; padre.prerequisito = ''; arreglado = true; }
        }
        if (m.correquisito === undefined) { m.correquisito = ''; arreglado = true; }
    });
    if(arreglado) guardarDatos(); 
}

// =================================================================
// 3. NAVEGACIÓN Y UI BÁSICA
// =================================================================
function toggleMobileMenu() {
    document.getElementById('mainNav').classList.toggle('expanded');
}

function cambiarPagina(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.getAttribute('onclick').includes(pageId)) btn.classList.add('active');
    });
    
    const nav = document.getElementById('mainNav');
    if(nav.classList.contains('expanded')) nav.classList.remove('expanded');

    actualizarVistas();
    
    if(pageId === 'dashboard-page') { setTimeout(() => { renderizarDashboard(); }, 50); }
    if(pageId === 'horario-page') renderizarHorario();
}

function actualizarColorPreview() {
    document.getElementById('colorPreview').style.backgroundColor = document.getElementById('colorMateria').value;
}

function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// =================================================================
// 4. CATÁLOGOS Y FORMULARIOS
// =================================================================
async function cambiarCatalogoCarrera() {
    const carrera = document.getElementById('selectorCarrera').value;
    const txtArea = document.getElementById('jsonCatalogo');
    
    if(carrera === 'CUSTOM') {
        txtArea.value = '{\n  "CLAVE": {"nombre": "MATERIA NUEVA", "creditos": 8, "prereq": "", "correq": "", "color": "#a8a8a8"}\n}';
        txtArea.disabled = false;
        cargarDatalist();
    } else {
        try {
            const respuesta = await fetch(`http://localhost:3000/api/catalogo/${carrera}`);
            if (!respuesta.ok) throw new Error("Catálogo no encontrado");
            const datosJson = await respuesta.json();
            txtArea.value = JSON.stringify(datosJson, null, 2);
            txtArea.disabled = true; 
            cargarDatalist();
        } catch (error) {
            txtArea.value = `Error: Falta crear el archivo ${carrera}.json en la carpeta "catalogos".`;
            document.getElementById('listaMaterias').innerHTML = ''; 
        }
    }
    localStorage.setItem('carreraSeleccionada', carrera);
}

function generarCatalogoDesdeOferta() {
    if(Object.keys(ofertaAcademica).length === 0) { alert("⚠️ Primero extrae la oferta del SIIAU."); return; }
    const nuevoCatalogo = {};
    const paleta = ["#58db33", "#b61bee", "#f5950f", "#0ff5f1", "#ff75d3", "#0A84FF"];
    let colorIdx = 0;

    for(let nrc in ofertaAcademica) {
        let curso = ofertaAcademica[nrc];
        if(!nuevoCatalogo[curso.clave]) {
            nuevoCatalogo[curso.clave] = {
                nombre: curso.materia,
                creditos: parseInt(curso.creditos) || 8, 
                prereq: "", correq: "",
                color: paleta[colorIdx % paleta.length]
            };
            colorIdx++;
        }
    }
    document.getElementById('selectorCarrera').value = 'CUSTOM';
    document.getElementById('jsonCatalogo').value = JSON.stringify(nuevoCatalogo, null, 2);
    document.getElementById('jsonCatalogo').disabled = false;
    cargarDatalist();
    alert(`¡PUM! 💥 Catálogo auto-generado con ${Object.keys(nuevoCatalogo).length} materias únicas.`);
}

function cargarDatalist() {
    try {
        const catalogo = JSON.parse(document.getElementById('jsonCatalogo').value);
        const dl = document.getElementById('listaMaterias');
        dl.innerHTML = '';
        for(let key in catalogo) {
            let option = document.createElement('option');
            option.value = `${key} - ${catalogo[key].nombre}`;
            dl.appendChild(option);
        }
    } catch(e){}
}

function seleccionarDelCatalogo(val) {
    if(editandoNRC || !val) return;
    let nrc = val.split(' - ')[0].trim().toUpperCase();
    autocompletarFormulario(nrc);
}

document.getElementById('nrc').addEventListener('input', function() {
    if(editandoNRC) return;
    autocompletarFormulario(this.value.trim().toUpperCase());
});

function autocompletarFormulario(nrc) {
    if (nrc.startsWith("1") && nrc.length === 5) { nrc = "I" + nrc.substring(1); }
    try {
        const catalogo = JSON.parse(document.getElementById('jsonCatalogo').value);
        if (catalogo[nrc]) {
            document.getElementById('nrc').value = nrc;
            document.getElementById('nombre').value = catalogo[nrc].nombre;
            document.getElementById('creditos').value = catalogo[nrc].creditos;
            document.getElementById('prerequisito').value = catalogo[nrc].prereq || '';
            document.getElementById('correquisito').value = catalogo[nrc].correq || '';
            if(catalogo[nrc].color) {
                document.getElementById('colorMateria').value = catalogo[nrc].color;
                actualizarColorPreview();
            }
            document.getElementById('nrc').style.borderColor = "var(--accent-blue)"; 
        } else {
            document.getElementById('nrc').value = nrc;
            document.getElementById('nrc').style.borderColor = "rgba(255,255,255,0.15)"; 
        }
    } catch(e) {}
}

function gestionarEstado() {
    const est = document.getElementById('estado').value;
    const calInput = document.getElementById('calificacion');
    if (est === 'aprobada' || est === 'reprobada' || est === 'convalidada') { calInput.disabled = false; } else { calInput.disabled = true; calInput.value = ''; }
}

// =================================================================
// 5. GESTIÓN DE MATERIAS Y MALLA
// =================================================================
function obtenerCreditosAprobados() { 
    return materias.filter(m => m.estado === 'aprobada' || m.estado === 'convalidada').reduce((sum, m) => sum + m.creditos, 0); 
}

function encontrarLetraLibre(sem, letraSugerida) {
    let letrasUsadas = materias.filter(m => m.semestre === sem).map(m => m.letra);
    if (!letrasUsadas.includes(letraSugerida)) return letraSugerida;
    for (let i = 65; i <= 90; i++) { let l = String.fromCharCode(i); if (!letrasUsadas.includes(l)) return l; }
    return letraSugerida;
}

function obtenerSiguienteSemestre(semestreActual, apertura) {
    let sem = semestreActual + 1; apertura = apertura || 'ambos';
    if (apertura === 'par' && sem % 2 !== 0) sem++;
    if (apertura === 'impar' && sem % 2 === 0) sem++;
    return sem;
}

function procesarNormatividadYDependencias() {
    let cambios = false;
    for (let i = 0; i < materias.length; i++) {
        let m = materias[i];
        if (!m.nrcOriginal) { m.nrcOriginal = m.nrc; cambios = true; }

        if (m.estado === 'reprobada' && !m.recursamientoGenerado) {
            m.recursamientoGenerado = true; cambios = true;
            let historial = materias.filter(x => (x.nrcOriginal === m.nrcOriginal) && x.estado === 'reprobada').length;
            if (historial >= 2) {
                alert(`ART. 35: Has reprobado "${m.nombre}" por segunda ocasión. Causa BAJA DEFINITIVA.`);
            } else {
                let nrcRecursamiento = m.nrc + '-R';
                let semestreRecursamiento = obtenerSiguienteSemestre(m.semestre, m.apertura);
                
                if (!materias.find(x => x.nrc === nrcRecursamiento)) {
                    let recursamiento = { ...m, nrc: nrcRecursamiento, nrcOriginal: m.nrcOriginal, semestre: semestreRecursamiento, estado: 'pendiente', calificacion: '', recursamientoGenerado: false, esArt34: true };
                    recursamiento.letra = encontrarLetraLibre(semestreRecursamiento, m.letra);
                    materias.push(recursamiento);
                    materias.forEach(d => {
                        if (d.prerequisito === m.nrc) { d.prerequisito = nrcRecursamiento; }
                        if (d.correquisito === m.nrc) { d.correquisito = nrcRecursamiento; }
                    });
                }
            }
        }
    }

    let cascadaActiva = true; let iteraciones = 0;
    while(cascadaActiva && iteraciones < 20) {
        cascadaActiva = false; iteraciones++;
        materias.forEach(hijo => {
            if (hijo.prerequisito) {
                let padre = materias.find(p => p.nrc === hijo.prerequisito);
                if (padre && hijo.semestre <= padre.semestre) {
                    hijo.semestre = obtenerSiguienteSemestre(padre.semestre, hijo.apertura);
                    hijo.letra = encontrarLetraLibre(hijo.semestre, hijo.letra);
                    cambios = true; cascadaActiva = true;
                }
            }
            if (hijo.correquisito) {
                let correq = materias.find(c => c.nrc === hijo.correquisito);
                if (correq && hijo.semestre < correq.semestre) {
                    hijo.semestre = correq.semestre;
                    hijo.letra = encontrarLetraLibre(hijo.semestre, hijo.letra);
                    cambios = true; cascadaActiva = true;
                }
            }
        });
    }
    if (cambios) guardarDatos();
}

function agregarMateria() {
    const nrc = document.getElementById('nrc').value.trim().toUpperCase(); const nombre = document.getElementById('nombre').value; const semestre = parseInt(document.getElementById('semestre').value);
    const letra = document.getElementById('letra').value; const apertura = document.getElementById('apertura').value; const creditos = parseInt(document.getElementById('creditos').value);
    let estado = document.getElementById('estado').value; let calificacion = parseFloat(document.getElementById('calificacion').value) || 0;
    const prerequisito = document.getElementById('prerequisito').value.trim().toUpperCase(); const correquisito = document.getElementById('correquisito').value.trim().toUpperCase(); const color = document.getElementById('colorMateria').value;

    if (!nrc || !nombre || isNaN(semestre) || isNaN(creditos)) { alert("Completa los campos obligatorios."); return; }
    if (estado === 'aprobada' && calificacion < 60) { estado = 'reprobada'; } else if (estado === 'reprobada' && calificacion >= 60) { estado = 'aprobada'; }

    const indexExistente = materias.findIndex(m => m.semestre === semestre && m.letra === letra);

    if (editandoNRC) {
        const indexOriginal = materias.findIndex(m => m.nrc === editandoNRC);
        if (indexExistente !== -1 && indexExistente !== indexOriginal) { if (!confirm(`Ya existe materia en ${semestre}${letra}. ¿Reemplazar?`)) return; materias.splice(indexExistente, 1); }
        const iFinal = materias.findIndex(m => m.nrc === editandoNRC);
        materias[iFinal] = { ...materias[iFinal], nrc, nombre, semestre, letra, apertura, creditos, estado, calificacion, prerequisito, correquisito, color };
        cancelarEdicion();
    } else {
        if (indexExistente !== -1) { if (!confirm(`Ya existe materia en ${semestre}${letra}. ¿Reemplazar?`)) return; materias.splice(indexExistente, 1); }
        materias.push({ nrc, nrcOriginal: nrc, nombre, semestre, letra, apertura, creditos, estado, calificacion, prerequisito, correquisito, color, recursamientoGenerado: false, esArt34: false });
        cancelarEdicion();
    }
    guardarDatos(); procesarNormatividadYDependencias(); actualizarVistas();
}

function editarMateria(nrc) {
    const m = materias.find(x => x.nrc === nrc); if (!m) return;
    document.getElementById('nrc').value = m.nrc; document.getElementById('nombre').value = m.nombre; document.getElementById('semestre').value = m.semestre;
    document.getElementById('letra').value = m.letra; document.getElementById('apertura').value = m.apertura || 'ambos'; document.getElementById('creditos').value = m.creditos;
    document.getElementById('estado').value = m.estado || 'pendiente'; document.getElementById('calificacion').value = m.calificacion || '';
    document.getElementById('prerequisito').value = m.prerequisito || ''; document.getElementById('correquisito').value = m.correquisito || ''; document.getElementById('colorMateria').value = m.color;
    actualizarColorPreview(); gestionarEstado(); editandoNRC = m.nrc;
    document.getElementById('tituloFormulario').innerText = `Editando: ${m.nombre}`;
    const btnGuardar = document.getElementById('btnSubmit'); btnGuardar.innerText = "Actualizar Materia"; btnGuardar.style.background = "rgba(255, 159, 10, 0.4)";
    document.getElementById('btnCancelar').style.display = "block"; document.getElementById('buscadorCatalogo').value = ''; cambiarPagina('form-page');
}

function cancelarEdicion() {
    editandoNRC = null; document.getElementById('tituloFormulario').innerText = "Registrar Nueva Materia";
    const btn = document.getElementById('btnSubmit'); btn.innerText = "Guardar en el Sistema"; btn.style.background = "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))";
    document.getElementById('btnCancelar').style.display = "none";
    document.getElementById('nrc').value = ''; document.getElementById('nombre').value = ''; document.getElementById('calificacion').value = '';
    document.getElementById('estado').value = 'pendiente'; document.getElementById('prerequisito').value = ''; document.getElementById('correquisito').value = ''; document.getElementById('nrc').style.borderColor = "rgba(255,255,255,0.15)"; gestionarEstado();
    actualizarColumnaAutomatica();
}

function eliminarMateria(nrc) {
    if (confirm(`¿Eliminar esta materia?`)) { materias.splice(materias.findIndex(m => m.nrc === nrc), 1); guardarDatos(); actualizarVistas(); }
}

window.cambiarEstadoSemestre = function(semestre, nuevoEstado) {
    if(!nuevoEstado) return;
    if(!confirm(`¿Cambiar TODAS las materias del Semestre ${semestre} a "${nuevoEstado}"?`)) return;

    let cambios = false;
    materias.forEach(m => {
        if(m.semestre === parseInt(semestre)) {
            m.estado = nuevoEstado; cambios = true;
            if(nuevoEstado === 'aprobada' || nuevoEstado === 'reprobada' || nuevoEstado === 'convalidada') {
                let nota = prompt(m.nombre + "\nCalificación final:", m.calificacion || (nuevoEstado === 'reprobada' ? 50 : 60));
                if (nota !== null && !isNaN(nota) && nota !== "") {
                    m.calificacion = parseFloat(nota);
                    if (m.calificacion >= 60 && nuevoEstado === 'reprobada') m.estado = 'aprobada';
                    if (m.calificacion < 60 && nuevoEstado === 'aprobada') m.estado = 'reprobada';
                } else { m.calificacion = m.calificacion || 0; }
            } else { m.calificacion = 0; }
        }
    });
    if(cambios) { guardarDatos(); procesarNormatividadYDependencias(); actualizarVistas(); }
}

// =================================================================
// 6. RENDERIZADO VISUAL (Malla, Listas, Exportar)
// =================================================================
function actualizarVistas() {
    const creditosTotales = obtenerCreditosAprobados();
    document.getElementById('indicadorCreditosListas').innerText = `Obtenidos: ${creditosTotales} / ${CREDITOS_TOTALES}`;
    document.getElementById('indicadorCreditosMalla').innerText = `Obtenidos: ${creditosTotales} / ${CREDITOS_TOTALES}`;
    renderizarListas(); renderizarMalla(); renderizarSeccionesBloqueadas(creditosTotales); 
    actualizarDropdownSemestresGenerador();
}

function actualizarDropdownSemestresGenerador() {
    const sel = document.getElementById('selSemestreGenerador');
    if(!sel) return;
    sel.innerHTML = '<option value="">Cargar de Semestre...</option>';
    if(materias.length === 0) return;
    const semestresUnicos = [...new Set(materias.map(m => m.semestre))].sort((a,b) => a - b);
    semestresUnicos.forEach(s => { sel.innerHTML += `<option value="${s}">Semestre ${s}</option>`; });
}

function getEstadoHtml(m) {
    if (m.estado === 'aprobada') return `<span class="badge-estado" style="background:rgba(48, 209, 88, 0.5);">Aprobada</span>`;
    if (m.estado === 'convalidada') return `<span class="badge-estado" style="background:rgba(191, 90, 242, 0.5);">Convalidada</span>`;
    if (m.estado === 'reprobada') return `<span class="badge-estado" style="background:rgba(255, 69, 58, 0.5);">Reprobada</span>`;
    if (m.estado === 'cursando') return `<span class="badge-estado" style="background:rgba(10, 132, 255, 0.5);">Cursando</span>`;
    return `<span class="badge-estado" style="background:rgba(142, 142, 147, 0.4);">Pendiente</span>`;
}

function renderizarListas() {
    const contenedor = document.getElementById('contenedorListas'); contenedor.innerHTML = '';
    if(materias.length === 0) { contenedor.innerHTML = '<p style="color:var(--text-muted);">No hay materias registradas.</p>'; return; }

    const materiasPorSemestre = {};
    materias.forEach(m => { if(!materiasPorSemestre[m.semestre]) materiasPorSemestre[m.semestre] = []; materiasPorSemestre[m.semestre].push(m); });

    Object.keys(materiasPorSemestre).sort((a,b) => a - b).forEach(semestre => {
        const matSem = materiasPorSemestre[semestre];
        const credProyectados = matSem.reduce((sum, m) => m.estado !== 'reprobada' ? sum + m.creditos : sum, 0);
        const credObtenidos = matSem.filter(m => m.estado === 'aprobada' || m.estado === 'convalidada').reduce((sum, m) => sum + m.creditos, 0);
        
        let tienePracticas = matSem.some(m => m.nrc === 'IA896');
        let alertaHtml = ((credProyectados > 45 && !tienePracticas) || matSem.length > 8) ? `<div class="alerta-sobrecarga">Semestre Sobrecargado</div>` : '';

        const details = document.createElement('details'); details.className = 'semestre-block';
        details.innerHTML = `
            <summary class="semestre-summary">
                <div style="display:flex; align-items:center;">Semestre ${semestre} &nbsp; ${alertaHtml}</div>
                <div style="display:flex; align-items:center; gap: 15px;">
                    <span style="color: var(--text-muted); font-size: 0.85em;">Proyectados: <strong style="color:#fff;">${credProyectados}</strong></span>
                    <span style="color: #30D158; font-size: 0.9em;">Obtenidos: <strong>${credObtenidos}</strong></span>
                    <select class="batch-select" onclick="event.stopPropagation()" onchange="cambiarEstadoSemestre(${semestre}, this.value); this.value='';">
                        <option value="">Lote...</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="cursando">Cursando</option>
                        <option value="aprobada">Aprobada</option>
                    </select>
                </div>
            </summary>`;

        matSem.forEach(m => {
            let badgeNormativo = m.esArt34 ? '<span class="badge-estado badge-art34">Art. 34</span>' : '';
            if (m.esArt34 && m.estado === 'reprobada') badgeNormativo = '<span class="badge-estado badge-art35">ART. 35</span>';
            let gradeText = (m.estado === 'aprobada' || m.estado === 'reprobada' || m.estado === 'convalidada') ? `Nota: ${m.calificacion}` : '';

            details.innerHTML += `
                <div class="materia-item" style="border-left: 6px solid ${m.color};">
                    <div class="materia-info">
                        <strong>${m.nombre}</strong> (Columna ${m.letra}) ${badgeNormativo}<br>
                        <span style="font-size: 0.85em; color: var(--text-muted); font-family:monospace;">NRC: ${m.nrc} | Créditos: ${m.creditos}</span>
                        <div style="margin-top:5px;">${getEstadoHtml(m)} <span style="font-weight:bold; font-size: 13px; margin-left: 8px; color: var(--text-main);">${gradeText}</span></div>
                    </div>
                    <div class="materia-acciones">
                        <button class="btn-editar" onclick="editarMateria('${m.nrc}')">Editar</button>
                        <button class="btn-eliminar" onclick="eliminarMateria('${m.nrc}')">Borrar</button>
                    </div>
                </div>`;
        });
        contenedor.appendChild(details);
    });
}

function renderizarMalla() {
    const contenedor = document.getElementById('contenedorMalla'); contenedor.innerHTML = ''; if(materias.length === 0) return;

    const maxSemestre = Math.max(...materias.map(m => m.semestre));
    let maxLetraCode = 72; materias.forEach(m => { if(m.letra) { let code = m.letra.charCodeAt(0); if(code > maxLetraCode) maxLetraCode = code; } });
    let letrasDinamicas = []; for(let i = 65; i <= maxLetraCode; i++) { letrasDinamicas.push(String.fromCharCode(i)); }

    let gridTemplate = `80px repeat(${letrasDinamicas.length}, 1fr) 100px`;
    let htmlMalla = `<div class="malla-grid" style="grid-template-columns: ${gridTemplate};"><div class="malla-header" style="background:transparent; border:none;">Semestre</div>`;
    
    letrasDinamicas.forEach(l => htmlMalla += `<div class="malla-header" style="background:transparent; border:none; color:var(--text-muted);">${l}</div>`);
    htmlMalla += `<div class="malla-header total-creditos" style="background:transparent; border:none; color:var(--text-muted);">Total</div>`;

    for(let s = 1; s <= maxSemestre; s++) {
        let creditosTotales = 0;
        htmlMalla += `<div class="malla-header" style="display:flex; align-items:center; justify-content:center; font-size:18px;">${s}</div>`;
        
        let materiasEspecialesSemestre = materias.filter(m => m.semestre === s && (m.nrc === 'SSINQU' || m.nrc === 'IA896'));
        
        letrasDinamicas.forEach(letra => {
            const materia = materias.find(m => m.semestre === s && m.letra === letra && m.nrc !== 'SSINQU' && m.nrc !== 'IA896');
            if (materia) {
                if (materia.estado !== 'reprobada') { creditosTotales += materia.creditos; }
                let prHtml = ''; if (materia.prerequisito) { let prMat = materias.find(x => x.nrc === materia.prerequisito); if (prMat) prHtml = `<div class="badge-pr">PR: ${prMat.semestre}${prMat.letra}</div>`; }
                let crHtml = ''; if (materia.correquisito) { let crMat = materias.find(x => x.nrc === materia.correquisito); if (crMat) crHtml = `<div class="badge-sm">SM: ${crMat.semestre}${crMat.letra}</div>`; }
                let gradeHtml = (materia.estado === 'aprobada' || materia.estado === 'reprobada' || materia.estado === 'convalidada') ? `<span class="materia-nota" style="font-size: 11px; margin-top: 2px;">Nota: <strong>${materia.calificacion}</strong></span>` : '';
                let rgbaBg = hexToRgba(materia.color, 0.15); 
                let isReprobadaClass = (materia.estado === 'reprobada') ? 'is-reprobada' : '';

                htmlMalla += `
                    <div class="malla-cell" style="background: transparent !important; border:none !important;">
                        <div class="malla-materia ${isReprobadaClass}" style="--color:${materia.color}; border-left: 4px solid ${materia.color}; background: ${rgbaBg};">
                            <div class="etiquetas-coord">${prHtml} ${crHtml}</div>
                            <span class="materia-nrc">${materia.nrc}</span>
                            <span style="line-height: 1.1; text-align:center;">${materia.nombre}</span>
                            <span style="font-size: 10px; margin-top: 4px; color: rgba(255,255,255,0.7);">Créditos: ${materia.creditos}</span>
                            ${gradeHtml}
                            ${getEstadoHtml(materia)}
                        </div>
                    </div>`;
            } else { htmlMalla += `<div class="malla-cell" style="background:transparent !important; border:none !important;"></div>`; }
        });

        materiasEspecialesSemestre.forEach(m => { if (m.estado !== 'reprobada') creditosTotales += m.creditos; });
        let tienePracticas = materiasEspecialesSemestre.some(m => m.nrc === 'IA896');
        let colorFila = (creditosTotales > 45 && !tienePracticas) ? 'rgba(255, 69, 58, 0.3)' : (creditosTotales >= 30 ? 'rgba(48, 209, 88, 0.3)' : 'rgba(255, 159, 10, 0.3)');
        let fontColor = (creditosTotales > 45 && !tienePracticas) ? '#FF453A' : (creditosTotales >= 30 ? '#30D158' : '#FF9F0A');

        htmlMalla += `<div class="malla-header total-creditos" style="background: ${colorFila}; color: ${fontColor}; display:flex; align-items:center; justify-content:center; flex-direction:column; border:none;">
            <span style="font-size: 1.4em;">${creditosTotales}</span>
        </div>`;

        materiasEspecialesSemestre.forEach(materia => {
            let gradeHtml = (materia.estado === 'aprobada' || materia.estado === 'reprobada' || materia.estado === 'convalidada') ? `<span class="materia-nota" style="margin-right:15px;">Nota: <strong>${materia.calificacion}</strong></span>` : '';
            let isReprobadaClass = (materia.estado === 'reprobada') ? 'is-reprobada' : '';
            htmlMalla += `
                <div class="malla-bar-especial ${isReprobadaClass}" style="--color:#30D158;">
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <strong style="font-size: 1.1em;">${materia.nombre}</strong><span class="materia-nrc" style="opacity: 0.8;">(${materia.nrc})</span>
                    </div>
                    <div style="display:flex; align-items:center; gap: 15px;">
                        <span style="font-size: 0.9em;">Créditos: ${materia.creditos}</span>${gradeHtml}${getEstadoHtml(materia)}
                    </div>
                </div>`;
        });
    }
    htmlMalla += `</div>`;
    contenedor.innerHTML = htmlMalla;
}

function renderizarSeccionesBloqueadas(creditos) {
    const faltan = CREDITOS_DESBLOQUEO - creditos;
    const htmlFinal = faltan > 0 
        ? `<div class="locked-screen"><h3>Bloqueado</h3><p>Te faltan <strong>${faltan}</strong> créditos aprobados para iniciar trámites.</p></div>`
        : `<div class="unlocked-screen"><h3>Desbloqueado</h3><p>Has alcanzado los créditos necesarios. Ya puedes iniciar tus trámites oficiales.</p></div>`;
    document.getElementById('contenidoSocial').innerHTML = htmlFinal;
    document.getElementById('contenidoPracticas').innerHTML = htmlFinal;
}

function exportarPDF() {
    const elemento = document.getElementById('contenedorMalla');
    const grid = elemento.querySelector('.malla-grid');
    const btn = document.getElementById('btnDescargaPdf');
    const txtOriginal = btn.innerHTML;
    
    let originalOverflow = ''; let originalWidth = '';
    if (grid) {
        originalOverflow = grid.style.overflowX; originalWidth = grid.style.width;
        grid.style.overflowX = 'visible'; grid.style.width = 'max-content'; elemento.style.width = 'max-content';
    }

    elemento.classList.add('pdf-mode');
    btn.innerHTML = 'Generando...'; btn.disabled = true;

    setTimeout(() => {
        const rect = elemento.getBoundingClientRect();
        const widthPx = rect.width + 40; const heightPx = rect.height + 40;
        const opciones = {
            margin: 10, filename: 'Malla_Gestión.pdf', image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 3, useCORS: true, width: widthPx, height: heightPx, windowWidth: widthPx },
            jsPDF: { unit: 'px', format: [widthPx > heightPx ? widthPx : heightPx, widthPx > heightPx ? heightPx : widthPx], orientation: widthPx > heightPx ? 'landscape' : 'portrait' }
        };

        html2pdf().set(opciones).from(elemento).save().then(() => {
            if (grid) { grid.style.overflowX = originalOverflow || 'auto'; grid.style.width = originalWidth || 'auto'; elemento.style.width = 'auto'; }
            elemento.classList.remove('pdf-mode'); btn.innerHTML = txtOriginal; btn.disabled = false;
        });
    }, 100); 
}

// =================================================================
// 7. RESPALDOS
// =================================================================
function descargarRespaldo() {
    if (materias.length === 0) { alert("No hay datos para respaldar."); return; }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(materias, null, 4));
    const enlaceDescarga = document.createElement('a');
    enlaceDescarga.setAttribute("href", dataStr);
    enlaceDescarga.setAttribute("download", "respaldo_malla_udeg.json");
    document.body.appendChild(enlaceDescarga); enlaceDescarga.click(); enlaceDescarga.remove();
}

function procesarArchivoCargado(event) {
    const archivo = event.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = function(e) {
        try {
            const contenido = JSON.parse(e.target.result);
            if (Array.isArray(contenido)) {
                if (confirm("¿Cargar este respaldo? Reemplazará tu malla actual.")) {
                    materias = contenido; sanitizarDatosGuardados(); guardarDatos(); actualizarVistas();
                    if(document.getElementById('dashboard-page').classList.contains('active')) renderizarDashboard();
                    alert("Respaldo cargado exitosamente.");
                }
            } else { alert("Formato incorrecto."); }
        } catch (error) { alert("Error al leer el JSON."); }
        event.target.value = ''; 
    };
    lector.readAsText(archivo);
}

// =================================================================
// 8. CONEXIÓN SIIAU Y HORARIOS MANUALES
// =================================================================
async function descargarOfertaAPI() {
    const ciclo = document.getElementById('apiCiclo').value;
    const centro = document.getElementById('apiCentro').value;
    const carrera = document.getElementById('apiCarrera').value.trim().toUpperCase();
    const estado = document.getElementById('estadoOferta');

    if(!carrera) { estado.style.color = "#FF453A"; estado.innerText = "Por favor ingresa la clave de la carrera."; return; }
    estado.style.color = "#FF9F0A"; estado.innerText = "Conectando al servidor y extrayendo datos del SIIAU... ⏳";

    try {
        const respuesta = await fetch('http://localhost:3000/api/extraer-oferta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ciclo, centro, carrera })
        });
        if (!respuesta.ok) throw new Error("Error en el servidor");
        const datos = await respuesta.json();
        const cantidadMaterias = Object.keys(datos).length;
        if (cantidadMaterias === 0) { estado.style.color = "#FF453A"; estado.innerText = "No se encontraron materias."; return; }

        ofertaAcademica = datos; localStorage.setItem('oferta_udeg', JSON.stringify(ofertaAcademica));
        estado.style.color = "#30D158"; estado.innerText = `¡Éxito! Se sincronizaron ${cantidadMaterias} materias en tiempo real.`;
        cargarDatalistOferta(); renderizarHorario();
    } catch (error) {
        estado.style.color = "#FF453A"; estado.innerText = "Error de conexión. Asegúrate de que el servidor (server.ts) esté corriendo.";
    }
}

function convertirHoraAMinutos(horaStr) {
    if(!horaStr.includes(':')) {
        if(horaStr.length === 4) { horaStr = horaStr.substring(0,2) + ':' + horaStr.substring(2); } 
        else if(horaStr.length === 3) { horaStr = '0' + horaStr.substring(0,1) + ':' + horaStr.substring(1); }
    }
    let partes = horaStr.split(':'); return parseInt(partes[0]) * 60 + parseInt(partes[1]);
}

function verificarConflictoHorario(nrcNuevo) {
    if(Object.keys(ofertaAcademica).length === 0) return [];
    let cursoNuevo = ofertaAcademica[nrcNuevo]; if(!cursoNuevo) return []; 
    let conflictosDetectados = [];
    horarioActual.forEach(nrcGuardado => {
        let cursoGuardado = ofertaAcademica[nrcGuardado];
        if(cursoGuardado) {
            cursoNuevo.horarios.forEach(hn => {
                cursoGuardado.horarios.forEach(hg => {
                    if(hn.dia === hg.dia) {
                        let startN = convertirHoraAMinutos(hn.inicio); let endN = convertirHoraAMinutos(hn.fin);
                        let startG = convertirHoraAMinutos(hg.inicio); let endG = convertirHoraAMinutos(hg.fin);
                        if(startN < endG && endN > startG) { if(!conflictosDetectados.includes(nrcGuardado)) conflictosDetectados.push(nrcGuardado); }
                    }
                });
            });
        }
    });
    return conflictosDetectados;
}

function reubicarMateriaInteligente(claveOriginal, nrcIgnorar) {
    if(Object.keys(ofertaAcademica).length === 0) return null;
    let candidatos = Object.keys(ofertaAcademica).filter(k => ofertaAcademica[k].clave === claveOriginal && k !== nrcIgnorar);
    for(let i = 0; i < candidatos.length; i++) {
        let candidatoNrc = candidatos[i]; let choca = false; let cursoCandidato = ofertaAcademica[candidatoNrc];
        horarioActual.forEach(hgNrc => {
            let cursoG = ofertaAcademica[hgNrc];
            if(cursoG) {
                cursoCandidato.horarios.forEach(hc => {
                    cursoG.horarios.forEach(hg => {
                        if(hc.dia === hg.dia) {
                            let sC = convertirHoraAMinutos(hc.inicio); let eC = convertirHoraAMinutos(hc.fin);
                            let sG = convertirHoraAMinutos(hg.inicio); let eG = convertirHoraAMinutos(hg.fin);
                            if(sC < eG && eC > sG) { choca = true; }
                        }
                    });
                });
            }
        });
        if(!choca) return candidatoNrc; 
    }
    return null; 
}

function agregarAlHorario() {
    let nrc = document.getElementById('nrcHorario').value.trim(); if(!nrc) return;
    if(Object.keys(ofertaAcademica).length === 0) { alert("Sube el JSON de Oferta Académica del semestre."); return; }
    if(!ofertaAcademica[nrc]) { alert("Ese NRC no existe en la base de datos cargada."); return; }
    if(horarioActual.includes(nrc)) { alert("Esta materia ya está en tu horario."); return; }

    let conflictos = verificarConflictoHorario(nrc);
    if(conflictos.length > 0) {
        let confNombres = conflictos.map(c => ofertaAcademica[c].materia).join(", ");
        if(confirm(`Colisión detectada con: ${confNombres}.\n\n¿Reemplazar e intentar reubicar automáticamente?`)) {
            horarioActual = horarioActual.filter(x => !conflictos.includes(x)); horarioActual.push(nrc);
            conflictos.forEach(confNrc => {
                let vieja = ofertaAcademica[confNrc]; let nrcSalvador = reubicarMateriaInteligente(vieja.clave, confNrc);
                if(nrcSalvador) { horarioActual.push(nrcSalvador); alert(`Reubicación Exitosa: Se movió "${vieja.materia}" al NRC ${nrcSalvador}`); } 
                else { alert(`Error: No se encontró horario libre para "${vieja.materia}". Fue removida.`); }
            });
        }
    } else { horarioActual.push(nrc); }

    document.getElementById('nrcHorario').value = ''; guardarHorario(); renderizarHorario();
}

function limpiarHorario() { if(confirm("¿Estás seguro de vaciar el calendario de horarios?")) { horarioActual = []; guardarHorario(); renderizarHorario(); } }

function renderizarHorario() {
    const grid = document.getElementById('gridCalendario'); if(!grid) return;
    grid.innerHTML = ''; 
    grid.innerHTML += `<div class="cal-header" style="grid-row:1; grid-column:1;"></div>`; 
    DIAS_NOMBRE.forEach((d, idx) => grid.innerHTML += `<div class="cal-header" style="grid-row:1; grid-column:${idx+2};">${d}</div>`);
    for(let i = 7; i <= 21; i++) { 
        let row = i - 5;
        grid.innerHTML += `<div class="cal-hora" style="grid-row:${row}; grid-column:1;">${i}:00</div>`; 
        for(let j=0; j<6; j++) { grid.innerHTML += `<div class="cal-celda" style="grid-row:${row}; grid-column:${j+2};"></div>`; } 
    }

    if(Object.keys(ofertaAcademica).length === 0) return;
    
    const paletaColores = ['#FF2D55', '#FF9F0A', '#FFD60A', '#30D158', '#64D2FF', '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F'];
    let colorMap = {}; let colorIndex = 0;

    horarioActual.forEach(nrc => {
        let curso = ofertaAcademica[nrc];
        if(curso) {
            if(!colorMap[curso.clave]) { colorMap[curso.clave] = paletaColores[colorIndex % paletaColores.length]; colorIndex++; }
            let colorClase = colorMap[curso.clave];

            curso.horarios.forEach(h => {
                if(h.inicio === "00:00" || h.inicio === "0:00") return; 
                let diaIndex = DIAS_LETRA.indexOf(h.dia);
                if(diaIndex !== -1) {
                    let startMin = convertirHoraAMinutos(h.inicio) - 420; let endMin = convertirHoraAMinutos(h.fin) - 420; let duracion = endMin - startMin;
                    let topOffset = (startMin % 60) * (60 / 60); let altura = duracion * (60 / 60); let gridRowStart = Math.floor(startMin / 60) + 2; let gridCol = diaIndex + 2;
                    let rgbaBg = hexToRgba(colorClase, 0.20);
                    let edificioAula = (h.edificio && h.aula) ? `(${h.edificio}-${h.aula})` : `(Sin Aula)`;
                    let profesor = curso.profesor || 'Por definir';

                    let div = document.createElement('div'); div.className = 'bloque-clase'; div.style.gridColumn = gridCol; div.style.gridRow = `${gridRowStart} / span ${Math.ceil(duracion/60)}`;
                    div.style.background = rgbaBg; div.style.borderLeft = `4px solid ${colorClase}`; div.style.marginTop = `${topOffset}px`; div.style.height = `${altura - 4}px`; div.style.zIndex = 10;
                    div.innerHTML = `<strong style="font-size:11px; display:block; margin-bottom:2px; word-wrap:break-word;">${curso.materia}</strong><span style="font-size:9px; color:rgba(255,255,255,0.85); display:block; word-wrap:break-word;">${nrc} | ${profesor}</span><span style="font-size:9px; color:#64D2FF; font-weight:600; display:block; margin-top:2px; word-wrap:break-word;">${edificioAula}</span>`;
                    grid.appendChild(div);
                }
            });
        }
    });
}

// =================================================================
// 9. CEREBRO DEL GENERADOR DE HORARIOS (Dual Intelligence)
// =================================================================
function toggleGeneradorUI() {
    const chk = document.getElementById('chkTurnoUnico').checked;
    document.getElementById('turnoFijoContainer').style.display = chk ? 'block' : 'none';
    document.getElementById('turnoDiasContainer').style.display = chk ? 'none' : 'block';
    
    const panel = document.getElementById('panelDiasAvanzado');
    if(panel && panel.innerHTML.trim() === '') {
        let horas = '';
        for(let i=7; i<=21; i++) { let h = i<10?`0${i}`:i; horas+=`<option value="${h}:00">${h}:00</option>`; }
        ['L', 'M', 'I', 'J', 'V', 'S'].forEach(letra => {
            panel.innerHTML += `
            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; display:flex; gap:10px; align-items:center;">
                <strong style="width:15px; font-size:13px; color:var(--accent-blue);">${letra}:</strong>
                <label style="display:flex; align-items:center; gap:5px; margin:0; cursor:pointer;">
                    <input type="checkbox" id="desc-${letra}" title="Descanso" onchange="document.getElementById('ini-${letra}').disabled=this.checked; document.getElementById('fin-${letra}').disabled=this.checked;"> 
                    <span style="font-size:11px; color:#86868B;">Descanso</span>
                </label>
                <select id="ini-${letra}" style="padding:6px; font-size:11px; flex:1;">${horas}</select>
                <span style="font-size:11px; color:var(--text-muted);">a</span>
                <select id="fin-${letra}" style="padding:6px; font-size:11px; flex:1;"><option value="21:55">21:55</option>${horas}</select>
            </div>`;
        });
    }
}

function cargarSemestreGenerador() {
    const sem = parseInt(document.getElementById('selSemestreGenerador').value);
    if(isNaN(sem)) return alert("Selecciona un semestre válido de la lista.");
    if(Object.keys(ofertaAcademica).length === 0) return alert("Sube el JSON de Oferta Académica en la pestaña Horarios primero.");
    const matSemestre = materias.filter(m => m.semestre === sem && m.estado !== 'aprobada' && m.estado !== 'convalidada' && m.nrc !== 'SSINQU' && m.nrc !== 'IA896');
    if(matSemestre.length === 0) return alert(`No hay materias pendientes por cursar en el semestre ${sem}.`);
    
    let agregadas = 0; let noEncontradas = [];
    matSemestre.forEach(m => {
        let existeEnOferta = Object.values(ofertaAcademica).some(o => o.clave === (m.nrcOriginal || m.nrc));
        if(existeEnOferta) {
            if(!cursosGenerador.find(c => c.clave === (m.nrcOriginal || m.nrc))) { cursosGenerador.push({ clave: (m.nrcOriginal || m.nrc), nombre: m.nombre }); agregadas++; }
        } else { noEncontradas.push(m.nombre); }
    });

    renderizarListaGenerador(); actualizarListaMaestros();
    if(noEncontradas.length > 0) alert(`Se agregaron ${agregadas} materias.\n\nIgnoradas (No se ofertaron):\n- ${noEncontradas.join('\n- ')}`);
}

function agregarCursoGenerador(val) {
    if(!val) return;
    let clave = val.split(' - ')[0].trim().toUpperCase(); let nombreMateria = "";
    for(let nrc in ofertaAcademica) { if(ofertaAcademica[nrc].clave === clave) { nombreMateria = ofertaAcademica[nrc].materia; break; } }
    if(!nombreMateria) return alert("La materia no se encuentra en el JSON de oferta actual.");
    if(cursosGenerador.find(c => c.clave === clave)) return alert("Ya agregaste esta materia.");
    cursosGenerador.push({ clave: clave, nombre: nombreMateria });
    document.getElementById('buscadorGenerador').value = ''; renderizarListaGenerador(); actualizarListaMaestros();
}

function eliminarCursoGenerador(clave) {
    cursosGenerador = cursosGenerador.filter(c => c.clave !== clave);
    renderizarListaGenerador(); actualizarListaMaestros();
}

function renderizarListaGenerador() {
    const ul = document.getElementById('listaCursosGenerador'); ul.innerHTML = '';
    if(cursosGenerador.length === 0) { ul.innerHTML = '<span style="color:var(--text-muted); font-size:12px;">No hay materias seleccionadas.</span>'; }
    cursosGenerador.forEach(c => { ul.innerHTML += `<li><span><strong style="color:var(--accent-blue);">${c.clave}</strong> - ${c.nombre}</span> <button class="btn-eliminar" style="background:rgba(255, 69, 58, 0.2); color:#FF453A; border:1px solid rgba(255, 69, 58, 0.3);" onclick="eliminarCursoGenerador('${c.clave}')">X</button></li>`; });
}

function actualizarListaMaestros() {
    const contenedor = document.getElementById('listaMaestrosVeto');
    if(!contenedor) return;
    if(cursosGenerador.length === 0) { contenedor.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">Agrega materias primero para ver a los profesores...</span>'; return; }

    contenedor.innerHTML = ''; let hayProfesoresEnTotal = false;

    cursosGenerador.forEach(c => {
        let nrcs = Object.keys(ofertaAcademica).filter(k => ofertaAcademica[k].clave === c.clave);
        let profesDeLaMateria = new Set();
        nrcs.forEach(nrc => { let prof = ofertaAcademica[nrc].profesor; if(prof && prof.trim() !== '' && prof.toLowerCase() !== 'por definir') { profesDeLaMateria.add(prof.trim()); hayProfesoresEnTotal = true; } });

        if(profesDeLaMateria.size > 0) {
            let arrProfes = Array.from(profesDeLaMateria).sort();
            let htmlProfes = '';
            arrProfes.forEach(p => {
                htmlProfes += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin: 6px 0 0 10px; font-size:11px; color:#fff; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
                    <span style="flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p}">${p}</span>
                    <div style="display:flex; gap: 12px;">
                        <label style="cursor:pointer; display:flex; align-items:center; gap:4px; color:#FF453A;" title="Vetar"><input type="checkbox" class="chk-veto" value="${p}">🚫</label>
                        <label style="cursor:pointer; display:flex; align-items:center; gap:4px; color:#FFD60A;" title="Favorito"><input type="checkbox" class="chk-fav" value="${p}">⭐</label>
                    </div>
                </div>`;
            });

            contenedor.innerHTML += `
            <details style="margin-bottom: 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 6px;">
                <summary style="font-size:11.5px; color:var(--accent-blue); cursor:pointer; font-weight:600; outline:none; line-height: 1.3;">
                    ${c.nombre} <span style="color:var(--text-muted); font-size:9.5px; font-weight:normal;">(${arrProfes.length} profes)</span>
                </summary>
                <div style="margin-top: 5px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 5px;">${htmlProfes}</div>
            </details>`;
        }
    });

    if(!hayProfesoresEnTotal) contenedor.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">No hay profesores definidos.</span>';
}

function obtenerPreferencias() {
    let isGlobal = document.getElementById('chkTurnoUnico').checked;
    let vetados = []; let favoritos = [];
    document.querySelectorAll('.chk-veto:checked').forEach(chk => vetados.push(chk.value));
    document.querySelectorAll('.chk-fav:checked').forEach(chk => favoritos.push(chk.value));
    let prefs = { type: isGlobal ? 'global' : 'daily', limites: {}, vetados: vetados, favoritos: favoritos };

    if(isGlobal) { prefs.turno = document.getElementById('selTurnoGlobal').value; } 
    else {
        ['L', 'M', 'I', 'J', 'V', 'S'].forEach(letra => {
            let isDescanso = document.getElementById(`desc-${letra}`).checked;
            if(isDescanso) { prefs.limites[letra] = 'descanso'; } 
            else { prefs.limites[letra] = { min: convertirHoraAMinutos(document.getElementById(`ini-${letra}`).value), max: convertirHoraAMinutos(document.getElementById(`fin-${letra}`).value) }; }
        });
    }
    return prefs;
}

function respetaRestricciones(curso, prefs) {
    if(prefs.vetados && prefs.vetados.length > 0 && curso.profesor) { if(prefs.vetados.includes(curso.profesor.trim())) return false; }
    for(let h of curso.horarios) {
        let ini = convertirHoraAMinutos(h.inicio); let fin = convertirHoraAMinutos(h.fin);
        if(prefs.type === 'global') {
            if(prefs.turno === 'matutino' && fin > 895) return false;
            if(prefs.turno === 'vespertino' && ini < 840) return false;
        } else {
            let restDia = prefs.limites[h.dia];
            if(!restDia || restDia === 'descanso') return false; 
            if(ini < restDia.min || fin > restDia.max) return false;
        }
    }
    return true;
}

function tieneMasDe7HorasSeguidas(nrcs) {
    let horarioPorDia = { 'L': [], 'M': [], 'I': [], 'J': [], 'V': [], 'S': [] };
    nrcs.forEach(nrc => { ofertaAcademica[nrc].horarios.forEach(h => { if(h.inicio !== "00:00" && h.inicio !== "0:00") horarioPorDia[h.dia].push({ ini: convertirHoraAMinutos(h.inicio), fin: convertirHoraAMinutos(h.fin) }); }); });

    for(let dia in horarioPorDia) {
        let clases = horarioPorDia[dia].sort((a,b) => a.ini - b.ini);
        if(clases.length === 0) continue;
        let bloqueInicio = clases[0].ini; let bloqueFin = clases[0].fin;
        for(let i = 1; i < clases.length; i++) {
            let c = clases[i];
            if(c.ini - bloqueFin <= 30) { bloqueFin = Math.max(bloqueFin, c.fin); } 
            else {
                if(bloqueFin - bloqueInicio > 420) return true; 
                bloqueInicio = c.ini; bloqueFin = c.fin;
            }
        }
        if(bloqueFin - bloqueInicio > 420) return true;
    }
    return false;
}

function calcularPuntajeFavoritos(nrcs, favoritos) {
    let count = 0; nrcs.forEach(nrc => { let prof = ofertaAcademica[nrc].profesor; if(prof && favoritos.includes(prof.trim())) count++; });
    return count;
}

function choca(cursoNuevo, listaNrcsActual) {
    for(let hN of cursoNuevo.horarios) {
        if(hN.inicio === "00:00" || hN.inicio === "0:00") continue; 
        let sN = convertirHoraAMinutos(hN.inicio); let eN = convertirHoraAMinutos(hN.fin);
        for(let nrcG of listaNrcsActual) {
            let cursoG = ofertaAcademica[nrcG];
            for(let hG of cursoG.horarios) {
                if(hG.inicio === "00:00" || hG.inicio === "0:00") continue;
                if(hN.dia === hG.dia) { let sG = convertirHoraAMinutos(hG.inicio); let eG = convertirHoraAMinutos(hG.fin); if(sN < eG && eN > sG) return true; }
            }
        }
    }
    return false;
}

async function ejecutarGenerador() {
    if(Object.keys(ofertaAcademica).length === 0) { alert("Sube primero el JSON de oferta en la pestaña Horarios."); return; }
    if(cursosGenerador.length === 0) { alert("Agrega al menos una materia."); return; }

    const btn = document.getElementById('btnEjecutarGen');
    if(btn) { btn.innerHTML = 'Filtrando maestros y horarios...'; btn.disabled = true; }

    let prefs = obtenerPreferencias(); let gruposMaterias = []; let errorFaltaOferta = false;
    
    cursosGenerador.forEach(c => {
        let nrcsDisponibles = Object.keys(ofertaAcademica).filter(k => ofertaAcademica[k].clave === c.clave);
        let nrcsFiltrados = nrcsDisponibles.filter(nrc => respetaRestricciones(ofertaAcademica[nrc], prefs));
        if(nrcsFiltrados.length === 0) { errorFaltaOferta = c.nombre; }
        gruposMaterias.push(nrcsFiltrados);
    });

    if(errorFaltaOferta) {
        if(btn) { btn.innerHTML = 'Generar Opciones'; btn.disabled = false; }
        return alert(`Imposible agendar:\n"${errorFaltaOferta}"\nTodos sus profes están vetados o no encajan en tus horas.`);
    }

    const chkCupos = document.getElementById('chkCuposEnVivo');
    if (chkCupos && chkCupos.checked) {
        if(btn) btn.innerHTML = 'Consultando SIIAU en vivo... ⏳';
        let minCupos = parseInt(document.getElementById('minCuposVal').value) || 1;
        let cicloActual = document.getElementById('apiCiclo') ? document.getElementById('apiCiclo').value : '202610';
        let centroActual = document.getElementById('apiCentro') ? document.getElementById('apiCentro').value : 'D';
        let carreraActual = document.getElementById('apiCarrera') ? document.getElementById('apiCarrera').value.trim().toUpperCase() : 'INQU';
        let nrcsAProbar = gruposMaterias.flat(); 

        try {
            const resCupos = await fetch('http://localhost:3000/api/verificar-cupos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nrcs: nrcsAProbar, ciclo: cicloActual, centro: centroActual, carrera: carreraActual }) });
            if(!resCupos.ok) throw new Error("Error en backend");
            const dictCupos = await resCupos.json();

            for (let i = 0; i < gruposMaterias.length; i++) {
                gruposMaterias[i] = gruposMaterias[i].filter(nrc => (dictCupos[nrc] || 0) >= minCupos);
                if (gruposMaterias[i].length === 0) {
                    if(btn) { btn.innerHTML = 'Generar Opciones'; btn.disabled = false; }
                    return alert(`Sold Out 💀:\n"${cursosGenerador[i].nombre}"\nNingún grupo disponible tiene ${minCupos} cupo(s) en este momento.`);
                }
            }
        } catch (error) {
            if(btn) { btn.innerHTML = 'Generar Opciones'; btn.disabled = false; }
            return alert("⚠️ Error al conectar con el backend para checar cupos. Revisa tu terminal.");
        }
    }

    if(btn) btn.innerHTML = 'Armando combinaciones masivas...';

    setTimeout(() => {
        todosLosResultados = [];
        
        function backtrack(index, horarioTemp) {
            if(todosLosResultados.length >= 1500) return; 
            if(index === gruposMaterias.length) { 
                let masDe7h = tieneMasDe7HorasSeguidas(horarioTemp);
                let esMixto = (prefs.type === 'global' && prefs.turno === 'mixto');
                if (masDe7h && !esMixto) return;
                todosLosResultados.push({ nrcs: [...horarioTemp], masDe7h: masDe7h }); 
                return; 
            }
            for(let nrc of gruposMaterias[index]) {
                if(!choca(ofertaAcademica[nrc], horarioTemp)) { horarioTemp.push(nrc); backtrack(index + 1, horarioTemp); horarioTemp.pop(); }
            }
        }
        
        backtrack(0, []);
        window.prefsGeneradorGlobal = prefs;
        let poolEfi = []; let poolFav = [];

        todosLosResultados.forEach(res => {
            if (!res.masDe7h) { poolEfi.push(res.nrcs); }
            poolFav.push(res.nrcs);
        });

        window.resultadosEfi = poolEfi.sort((a, b) => calcularPuntajeHorario(b) - calcularPuntajeHorario(a));

        if (prefs.favoritos.length > 0) {
            window.resultadosFav = poolFav.sort((a, b) => {
                let fA = calcularPuntajeFavoritos(a, prefs.favoritos); let fB = calcularPuntajeFavoritos(b, prefs.favoritos);
                if(fB !== fA) return fB - fA; return calcularPuntajeHorario(b) - calcularPuntajeHorario(a);
            });
            let topFavStrings = window.resultadosFav.slice(0, 30).map(arr => arr.join(','));
            window.resultadosEfi = window.resultadosEfi.filter(arr => !topFavStrings.includes(arr.join(',')));
        } else { window.resultadosFav = []; }

        resultadosMostrados = 0;
        document.getElementById('resultadosGenerador').innerHTML = '';
        mostrarMasResultados();

        if(btn) { btn.innerHTML = 'Generar Opciones'; btn.disabled = false; }
    }, 50);
}

function calcularPuntajeHorario(nrcs) {
    let score = 0; let diasOcupados = new Set(); let gapsTotales = 0;
    let horarioPorDia = { 'L': [], 'M': [], 'I': [], 'J': [], 'V': [], 'S': [] };
    nrcs.forEach(nrc => { ofertaAcademica[nrc].horarios.forEach(h => { if(h.inicio !== "00:00" && h.inicio !== "0:00") { diasOcupados.add(h.dia); horarioPorDia[h.dia].push({ ini: convertirHoraAMinutos(h.inicio), fin: convertirHoraAMinutos(h.fin) }); } }); });

    score += (6 - diasOcupados.size) * 100;
    if(!diasOcupados.has('S')) score += 200;

    for(let dia in horarioPorDia) {
        let clases = horarioPorDia[dia].sort((x, y) => x.ini - y.ini);
        for(let i = 0; i < clases.length - 1; i++) { let gap = clases[i+1].ini - clases[i].fin; if(gap > 0) gapsTotales += gap; }
    }
    score -= (gapsTotales / 30) * 10; 
    return score;
}

function armarTarjetaHorario(res, index, tag) {
    let scoreEfi = Math.round(calcularPuntajeHorario(res));
    let scoreFav = calcularPuntajeFavoritos(res, window.prefsGeneradorGlobal.favoritos);
    
    let htmlList = '<ul style="list-style:none; padding:0; margin-top:15px;">';
    res.forEach(nrc => {
        let m = ofertaAcademica[nrc]; let hrs = m.horarios.map(h => `${h.dia} ${h.inicio}-${h.fin}`).join(' | ');
        let esFav = window.prefsGeneradorGlobal.favoritos.includes(m.profesor?.trim()) ? '⭐ ' : '';
        htmlList += `<li style="font-size:12px; margin-bottom:5px; color:var(--text-muted);"><strong style="color:#fff;">${m.materia}</strong><br><span style="color:var(--accent-blue);">NRC: ${nrc}</span> | Prof: <span style="color:#fff">${esFav}${m.profesor || 'Por definir'}</span><br><i>${hrs}</i></li>`;
    });
    htmlList += '</ul>';

    let jsonArr = JSON.stringify(res);
    return `<div class="gen-opcion" style="margin-bottom:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h4 style="margin:0; border:none; font-size:14px;">Opción #${index + 1} <span style="font-size:10px; opacity:0.6;">(${tag})</span></h4>
            <button class="btn-submit" style="background:rgba(48, 209, 88, 0.2) !important; color:#30D158 !important; border:1px solid rgba(48, 209, 88, 0.4); padding:6px 12px; font-size:12px;" onclick='aplicarHorarioGenerado(${jsonArr})'>Aplicar</button>
        </div>
        <div style="font-size:11px; margin-bottom:10px;"><span style="color:#FFD60A; margin-right:10px; font-weight:bold;">⭐ Favoritos: ${scoreFav}</span><span style="color:#64D2FF; font-weight:bold;">⚡ Eficiencia: ${scoreEfi}</span></div>
        <div class="mini-cal">${dibujarMiniCalendario(res)}</div>${htmlList}
    </div>`;
}

function mostrarMasResultados() {
    const container = document.getElementById('resultadosGenerador');
    const cargarMasBtn = document.getElementById('contenedorCargarMas');
    
    if(window.resultadosFav.length === 0 && window.resultadosEfi.length === 0) {
        container.innerHTML = `<div class="locked-screen"><h3>Sin combinaciones</h3><p>Las materias chocan entre sí, no hay cupos o rompieron la regla de las 7 horas seguidas.</p></div>`;
        cargarMasBtn.style.display = 'none'; return;
    }

    if(resultadosMostrados === 0) {
        let htmlBase = '';
        if(window.resultadosFav.length > 0) { htmlBase += `<details class="semestre-block" id="detallesFav" open><summary class="semestre-summary" style="color: #FFD60A !important;">⭐ Listado por Favoritos (Prioridad Alta)</summary><div id="gridFav" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:25px; padding: 15px;"></div></details>`; }
        if(window.resultadosEfi.length > 0) { htmlBase += `<details class="semestre-block" id="detallesEfi" style="margin-top:20px;" open><summary class="semestre-summary" style="color: #64D2FF !important;">⚡ Listado por Eficiencia (Anti-Huecos)</summary><div id="gridEfi" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:25px; padding: 15px;"></div></details>`; }
        container.innerHTML = htmlBase;
    }

    let limite = resultadosMostrados + 6; 
    const gridFav = document.getElementById('gridFav'); const gridEfi = document.getElementById('gridEfi');

    for(let i = resultadosMostrados; i < limite; i++) {
        if(gridFav && i < window.resultadosFav.length) { gridFav.innerHTML += armarTarjetaHorario(window.resultadosFav[i], i, 'FAV'); }
        if(gridEfi && i < window.resultadosEfi.length) { gridEfi.innerHTML += armarTarjetaHorario(window.resultadosEfi[i], i, 'EFI'); }
    }

    resultadosMostrados = limite;
    cargarMasBtn.style.display = (resultadosMostrados >= window.resultadosFav.length && resultadosMostrados >= window.resultadosEfi.length) ? 'none' : 'block';
}

function dibujarMiniCalendario(arregloNrcs) {
    const dias = ['L', 'M', 'I', 'J', 'V', 'S']; let html = `<div></div>`; 
    dias.forEach((d, idx) => html += `<div class="mini-header" style="grid-row:1; grid-column:${idx+2};">${d}</div>`);
    for(let i = 7; i <= 21; i++) {
        let row = i - 5; html += `<div class="mini-hora" style="grid-row:${row}; grid-column:1;">${i}</div>`;
        for(let j=0; j<6; j++) { html += `<div class="mini-celda" style="grid-row:${row}; grid-column:${j+2};"></div>`; }
    }
    
    const paletaColores = ['#FF2D55', '#FF9F0A', '#FFD60A', '#30D158', '#64D2FF', '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F'];
    let colorMap = {}; let colorIndex = 0;

    arregloNrcs.forEach(nrc => {
        let curso = ofertaAcademica[nrc];
        if(!colorMap[curso.clave]) { colorMap[curso.clave] = paletaColores[colorIndex % paletaColores.length]; colorIndex++; }
        let colorClase = colorMap[curso.clave];

        curso.horarios.forEach(h => {
            if(h.inicio === "00:00" || h.inicio === "0:00") return; 
            let diaIndex = dias.indexOf(h.dia);
            let startMin = convertirHoraAMinutos(h.inicio) - 420; let endMin = convertirHoraAMinutos(h.fin) - 420; let duracion = endMin - startMin;
            let topOffset = (startMin % 60) * (20 / 60); let altura = duracion * (20 / 60); let gridRowStart = Math.floor(startMin / 60) + 2; let gridCol = diaIndex + 2;
            let rgbaBg = hexToRgba(colorClase, 0.3); let borderLeft = `3px solid ${colorClase}`;
            let palabras = curso.materia.trim().split(/\s+/); let nombreMini = palabras[0];
            
            if (palabras.length > 1) {
                let conectores = ['DE', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'A', 'PARA', 'I', 'II', 'III']; let idx = 1;
                while (idx < palabras.length && conectores.includes(palabras[idx].toUpperCase())) idx++;
                let palabraClave = (idx < palabras.length) ? palabras[idx] : palabras[1];
                nombreMini = palabras[0].charAt(0) + '. ' + palabraClave;
            }

            html += `<div class="mini-bloque" style="grid-column:${gridCol}; grid-row:${gridRowStart} / span ${Math.ceil(duracion/60)}; background:${rgbaBg}; border-left:${borderLeft}; margin-top:${topOffset}px; height:${altura-2}px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                <span style="display:block; font-weight:bold; font-size:6px; text-align:center; word-wrap:break-word; line-height:1.1;">${nombreMini}</span>
            </div>`;
        });
    });
    return html;
}

window.aplicarHorarioGenerado = function(arrNrcs) { if(confirm("¿Reemplazar tu horario actual con esta opción?")) { horarioActual = arrNrcs; guardarHorario(); cambiarPagina('horario-page'); } }

// =================================================================
// 10. DASHBOARD Y ANALÍTICA
// =================================================================
function calcularImpacto(nrc, visitados = new Set()) {
    if (visitados.has(nrc)) return 0;
    visitados.add(nrc);
    let hijos = materias.filter(m => m.prerequisito === nrc || m.correquisito === nrc);
    let impacto = hijos.length;
    hijos.forEach(h => { impacto += calcularImpacto(h.nrc, visitados); });
    return impacto;
}

function renderizarDashboard() {
    if (materias.length === 0) return;

    const maxSemestre = Math.max(...materias.map(m => m.semestre));
    document.getElementById('dash-semestres').innerText = maxSemestre;
    document.getElementById('dash-creditos').innerText = `${obtenerCreditosAprobados()} / ${CREDITOS_TOTALES}`;
    
    const intentadas = materias.filter(m => m.estado === 'aprobada' || m.estado === 'reprobada').length;
    const aprobadas = materias.filter(m => m.estado === 'aprobada').length;
    const eficiencia = intentadas === 0 ? 0 : Math.round((aprobadas / intentadas) * 100);
    document.getElementById('dash-eficiencia').innerText = `${eficiencia}%`;

    let impactos = materias.map(m => { return { nombre: m.nombre, impacto: calcularImpacto(m.nrc) }; });
    impactos.sort((a, b) => b.impacto - a.impacto);
    const topCuellos = impactos.slice(0, 5); 
    
    const ulCuellos = document.getElementById('listaCuellosBotella'); ulCuellos.innerHTML = '';
    topCuellos.forEach((c, idx) => { if(c.impacto > 0) { ulCuellos.innerHTML += `<li style="background:rgba(0,0,0,0.2); border:none;"><span>${idx+1}. ${c.nombre}</span> <strong style="color:#FF453A;">Desbloquea ${c.impacto} materias</strong></li>`; } });

    let adj = {}; materias.forEach(m => adj[m.nrc] = []);
    materias.forEach(m => {
        if (m.prerequisito) { if(adj[m.prerequisito] !== undefined) { adj[m.prerequisito].push(m.nrc); adj[m.nrc].push(m.prerequisito); } }
        if (m.correquisito) { if(adj[m.correquisito] !== undefined) { adj[m.correquisito].push(m.nrc); adj[m.nrc].push(m.correquisito); } }
    });

    let visitados = new Set(); let componentes = [];
    materias.forEach(m => {
        if (!visitados.has(m.nrc)) {
            let comp = []; let q = [m.nrc]; visitados.add(m.nrc);
            while(q.length > 0) {
                let curr = q.shift(); comp.push(curr);
                adj[curr].forEach(vecino => { if(!visitados.has(vecino)) { visitados.add(vecino); q.push(vecino); } });
            }
            componentes.push(comp);
        }
    });

    let grafosHTML = "";
    componentes.forEach((comp) => {
        let matComp = materias.filter(m => comp.includes(m.nrc));
        let tieneDependencia = matComp.some(m => (m.prerequisito && comp.includes(m.prerequisito)) || (m.correquisito && comp.includes(m.correquisito)));
        
        if (tieneDependencia) {
            let raices = matComp.filter(m => (!m.prerequisito || !comp.includes(m.prerequisito)) && (!m.correquisito || !comp.includes(m.correquisito)));
            raices.sort((a, b) => a.semestre - b.semestre); 
            let nombrePrincipal = raices.length > 0 ? raices[0].nombre : "Especialización";

            let def = "graph LR;\n"; 
            matComp.forEach(m => { let idNodo = m.nrc.replace(/[^a-zA-Z0-9]/g, ''); let nombreLimpio = m.nombre.replace(/["']/g, ''); def += `  ${idNodo}["${nombreLimpio}"]\n`; });
            matComp.forEach(m => {
                if (m.prerequisito) { let idPadre = m.prerequisito.replace(/[^a-zA-Z0-9]/g, ''); let idNodo = m.nrc.replace(/[^a-zA-Z0-9]/g, ''); if (matComp.some(x => x.nrc === m.prerequisito)) { def += `  ${idPadre} --> ${idNodo}\n`; } }
                if (m.correquisito) { let idCorreq = m.correquisito.replace(/[^a-zA-Z0-9]/g, ''); let idNodo = m.nrc.replace(/[^a-zA-Z0-9]/g, ''); if (matComp.some(x => x.nrc === m.correquisito)) { def += `  ${idCorreq} -.-> ${idNodo}\n`; } }
            });
            matComp.forEach(m => { let idNodo = m.nrc.replace(/[^a-zA-Z0-9]/g, ''); let colorHex = m.color || '#3498db'; def += `  style ${idNodo} fill:#1e1e24,stroke:${colorHex},stroke-width:2px,color:#fff;\n`; });

            grafosHTML += `<div class="ruta-grafo"><h4 style="border:none;">Ruta: ${nombrePrincipal}</h4><div class="mermaid" style="background:transparent; border:1px solid rgba(255,255,255,0.1);">${def}</div></div>`;
        }
    });

    const grafoContainer = document.getElementById('grafoMermaidContainer');
    if (grafosHTML !== "") {
        grafoContainer.innerHTML = grafosHTML;
        setTimeout(() => {
            try {
                mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
                document.querySelectorAll('.mermaid').forEach(el => el.removeAttribute('data-processed'));
                mermaid.init(undefined, document.querySelectorAll('.mermaid'));
            } catch(e) { console.error("Error al dibujar el grafo:", e); }
        }, 100);
    } else {
        grafoContainer.innerHTML = "<p style='color:var(--text-muted); margin-top:10px;'>Añade materias con dependencias para visualizar los grafos.</p>";
    }
}

// =================================================================
// 11. SINCRONIZACIÓN MONGODB BACKEND
// =================================================================
async function checkBackendStatus() {
    const led = document.getElementById('statusLed');
    try {
        const res = await fetch('http://localhost:3000/api/status');
        if (!res.ok) throw new Error();
        led.style.background = "#30D158"; led.style.boxShadow = "0 0 8px #30D158"; led.title = "Servidor en línea";
    } catch (e) {
        led.style.background = "#FF453A"; led.style.boxShadow = "0 0 8px #FF453A"; led.title = "Servidor fuera de línea";
    }
}
setInterval(checkBackendStatus, 10000); checkBackendStatus();

async function respaldarEnNube() {
    const btn = event.currentTarget; const originalText = btn.innerHTML; const lastSyncTxt = document.getElementById('lastSync');
    btn.disabled = true; btn.style.opacity = "0.7"; btn.innerHTML = "<span>⏳</span> Sincronizando...";

    try {
        const respuesta = await fetch('http://localhost:3000/api/guardar-malla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ malla: materias }) });
        if (!respuesta.ok) throw new Error();

        btn.style.background = "#30D158"; btn.innerHTML = "<span>✅</span> ¡Hecho!";
        lastSyncTxt.innerText = `Último respaldo: ${new Date().toLocaleTimeString()}`;
        setTimeout(() => { btn.style.background = "#007AFF"; btn.innerHTML = originalText; btn.disabled = false; btn.style.opacity = "1"; }, 2000);
    } catch (error) {
        btn.style.background = "#FF453A"; btn.innerHTML = "<span>❌</span> Error de Red";
        setTimeout(() => { btn.style.background = "#007AFF"; btn.innerHTML = originalText; btn.disabled = false; btn.style.opacity = "1"; }, 3000);
    }
}

// =================================================================
// 12. 🛠️ MEJORAS DE EXPERIENCIA DE USUARIO (UX)
// =================================================================
function obtenerSiguienteColumna(sem) {
    let letrasUsadas = materias.filter(m => m.semestre === sem).map(m => m.letra);
    if (letrasUsadas.length === 0) return 'A';
    
    let maxLetra = 'A';
    letrasUsadas.forEach(l => { if (l > maxLetra) maxLetra = l; });
    
    let nextCode = maxLetra.charCodeAt(0) + 1;
    if (nextCode > 82) return 'R';
    return String.fromCharCode(nextCode);
}

function actualizarColumnaAutomatica() {
    let sem = parseInt(document.getElementById('semestre').value);
    if (!isNaN(sem)) {
        let letraLibre = obtenerSiguienteColumna(sem); 
        let selectorLetra = document.getElementById('letra');
        if (selectorLetra.querySelector(`option[value="${letraLibre}"]`)) {
            selectorLetra.value = letraLibre;
        }
    }
}

// Guardar al dar Enter
document.querySelector('.formulario').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); agregarMateria(); }
});

// Detectar cambios en el semestre para saltar a la columna correcta sin regresar
document.getElementById('semestre').addEventListener('input', actualizarColumnaAutomatica);
document.getElementById('semestre').addEventListener('change', actualizarColumnaAutomatica);