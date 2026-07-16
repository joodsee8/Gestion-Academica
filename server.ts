import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import mongoose from 'mongoose'; 
import 'dotenv/config'; 
import { MateriaModel } from './materia.js'; 
import fs from 'fs';
import axios from 'axios';

const app = express();
const PUERTO = 3000;

// Permisos abiertos para que el navegador no llore
app.use(cors());
app.use(express.json());

// Conexión a Base de Datos
mongoose.connect(process.env.MONGO_URI as string)
    .then(() => console.log('Base de Datos MongoDB ejecutandose'))
    .catch((err) => console.error('Error conectando a Mongo:', err));


// --- RUTA 1: STATUS DEL LED ---
app.get('/api/status', (req, res) => {
    res.json({ status: "vivo" });
});


// --- RUTA 2: GUARDAR MALLA EN MONGODB ---
app.post('/api/guardar-malla', async (req, res) => {
    try {
        const { malla } = req.body; 

        await MateriaModel.deleteMany({}); 
        const resultado = await MateriaModel.insertMany(malla);

        console.log(`[DB] Malla sincronizada: ${resultado.length} materias guardadas.`);
        res.json({ mensaje: "Malla guardada en la nube con éxito", cantidad: resultado.length });
    } catch (error) {
        console.error("Error al guardar:", error);
        res.status(500).json({ error: "No se pudo guardar en la base de datos" });
    }
});


// --- RUTA 3: EXTRAER OFERTA SIIAU ---
app.post('/api/extraer-oferta', async (req, res) => {
    const { ciclo, centro, carrera } = req.body;
    console.log(`\n[API] Recibí petición para: ${carrera} en ${centro} (${ciclo})`);

    const url = 'http://consulta.siiau.udg.mx/wco/sspseca.consulta_oferta';
    const formData = new URLSearchParams();
    formData.append('ciclop', ciclo);
    formData.append('cup', centro);
    formData.append('majrp', carrera);
    formData.append('crsep', '');
    formData.append('materiap', '');
    formData.append('horaip', '');
    formData.append('horafp', '');
    formData.append('edifp', '');
    formData.append('aulap', '');
    formData.append('ordenp', '0');
    formData.append('mostrarp', '500');

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData.toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder('iso-8859-1');
        const html = decoder.decode(buffer);
        
        const $ = cheerio.load(html);
        const ofertaJSON: { [nrc: string]: any } = {};

        $('table[border="1"] > tbody > tr').each((i, row) => {
            const celdas = $(row).children('td');
            if (celdas.length >= 8) {
                const nrc = $(celdas[0]).text().trim();
                const clave = $(celdas[1]).text().trim();
                const materia = $(celdas[2]).text().trim();
                
                if (/^\d+$/.test(nrc)) {
                    let profesor = "Por definir";
                    const profCell = $(celdas[8]).find('td.tdprofesor').eq(1).text().trim();
                    if (profCell && profCell.length > 2) profesor = profCell;

                    const horarios: any[] = [];
                    $(celdas[7]).find('table tr').each((j, filaHorario) => {
                        const colsHorario = $(filaHorario).find('td');
                        if (colsHorario.length >= 5) {
                            const horasStr = $(colsHorario[1]).text().trim();
                            const diasStr = $(colsHorario[2]).text().trim();
                            const edificio = $(colsHorario[3]).text().trim();
                            const aula = $(colsHorario[4]).text().trim();

                            if (horasStr.includes('-')) {
                                const partesHora = horasStr.split('-');
                                const horaInicio = partesHora[0].replace(/(\d{2})(\d{2})/, '$1:$2');
                                const horaFin = partesHora[1].replace(/(\d{2})(\d{2})/, '$1:$2');
                                const mapaDias = ['L', 'M', 'I', 'J', 'V', 'S'];
                                const diasLimpios = diasStr.replace(/\s+/g, '');
                                
                                for (let k = 0; k < diasLimpios.length && k < mapaDias.length; k++) {
                                    if (diasLimpios[k] !== '.') {
                                        horarios.push({ dia: mapaDias[k], inicio: horaInicio, fin: horaFin, edificio: edificio, aula: aula });
                                    }
                                }
                            }
                        }
                    });
                    ofertaJSON[nrc] = { clave, materia, profesor, horarios };
                }
            }
        });

        console.log(`[API] ¡Éxito! Se enviarán ${Object.keys(ofertaJSON).length} materias al frontend.`);
        res.json(ofertaJSON);
    } catch (error) {
        console.error("[API] Error interno:", error);
        res.status(500).json({ error: "No se pudo conectar con el SIIAU" });
    }
});

// --- RUTA 4: LEER CATÁLOGOS JSON EXTERNOS ---
app.get('/api/catalogo/:carrera', (req, res) => {
    const carrera = req.params.carrera;
    const rutaArchivo = `./catalogos/${carrera}.json`;

    if (fs.existsSync(rutaArchivo)) {
        const archivo = fs.readFileSync(rutaArchivo, 'utf-8');
        res.json(JSON.parse(archivo));
    } else {
        res.status(404).json({ error: "No se encontró el catálogo de esta carrera" });
    }
});


// RASTREADOR DE RUTAS
console.log("Rutas cargadas en memoria: /api/status, /api/guardar-malla, /api/extraer-oferta");

// ENCENDEMOS EL MOTOR
// ENCENDEMOS EL MOTOR
app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`Servidor Backend ejecutandose en: http://localhost:${PUERTO}`);
});

// --- RUTA 5: SNIPER DE CUPOS EN VIVO (REAL) ---
app.post('/api/verificar-cupos', async (req, res) => {
    // Ahora recibimos también el centro y la carrera para saber qué página buscar
    const { nrcs, ciclo, centro, carrera } = req.body;
    
    if (!nrcs || !Array.isArray(nrcs) || !centro || !carrera) {
        return res.status(400).json({ error: "Faltan datos para la consulta" });
    }

    let cuposResult: any = {};

    try {
        console.log(`[Sniper] Infiltrando SIIAU para ver cupos reales de ${carrera} en ${centro}...`);
        
        // Armamos la URL real del SIIAU con los datos que nos mandó el Frontend
        const urlSiiau = `http://consulta.siiau.udg.mx/wco/sspmacr.forma_listado?ciclopi=${ciclo}&cupi=${centro}&crsep=${carrera}&mostrarpi=1000`;
        
        // Hacemos la petición al SIIAU
        const respuesta = await axios.get(urlSiiau);
        const $ = cheerio.load(respuesta.data);

        // Recorremos la tabla gigante de materias
        $('table[border="1"] > tbody > tr').each((i, row) => {
            const celdas = $(row).children('td');
            
            if (celdas.length >= 8) {
                const nrcFila = $(celdas[0]).text().trim();

                // Si el NRC de esta fila está en la lista de los que queremos verificar...
                if (nrcs.includes(nrcFila)) {
                    // Columna 5 = CUP (Totales)
                    // Columna 6 = DIS (Disponibles) <-- ¡ESTA ES LA BUENA!
                    const cuposDisponibles = parseInt($(celdas[6]).text().trim()) || 0;
                    
                    cuposResult[nrcFila] = cuposDisponibles;
                }
            }
        });

        console.log(`[Sniper] Extracción exitosa. Encontramos cupos para ${Object.keys(cuposResult).length} materias.`);
        res.json(cuposResult);

    } catch (error) {
        console.error("Error al consultar cupos en SIIAU:", error);
        res.status(500).json({ error: "Error consultando SIIAU" });
    }
});