import mongoose from 'mongoose';

// Definimos las reglas exactas de tu malla_udeg
const materiaSchema = new mongoose.Schema({
    nrc: { type: String, required: true },
    nombre: { type: String, required: true },
    semestre: { type: Number, required: true },
    letra: { type: String }, // La columna en tu Grid
    creditos: { type: Number, required: true },
    estado: { 
        type: String, 
        enum: ['pendiente', 'cursando', 'aprobada', 'reprobada', 'convalidada'],
        default: 'pendiente'
    },
    calificacion: { type: Number, default: 0 },
    prerequisito: { type: String, default: '' },
    correquisito: { type: String, default: '' },
    color: { type: String }
});

// Exportamos el modelo para usarlo en el servidor
export const MateriaModel = mongoose.model('Materia', materiaSchema);