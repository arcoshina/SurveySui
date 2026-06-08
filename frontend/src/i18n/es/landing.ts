import type { LandingDict } from '../zh/landing'

const landing: LandingDict = {
  heroTitle: 'Encuestas verdaderamente justas y transparentes',
  heroDesc: 'Respuestas gratuitas, distribución automática de recompensas y datos inmutables. SurveySui es una plataforma de encuestas creada en la blockchain pública.',
  btnCreate: 'Crear encuesta',
  btnGuide: 'Guía para principiantes',
  btnDocs: 'Documentación',
  btnExplore: 'Explorar Plaza',
  stepsTitle: '3 pasos para completar una encuesta',
  stepLabel: 'Paso',
  steps: [
    { title: 'El creador publica la encuesta', desc: 'Escribe las preguntas en Markdown, define la recompensa por respuesta y publícala con una sola transacción.' },
    { title: 'Los encuestados responden gratis', desc: 'No se requiere poseer criptomonedas. La tarifa de gas de la transacción la cubre el creador.' },
    { title: 'Recompensas automáticas', desc: 'Al responder, el contrato inteligente liquida y envía las recompensas directamente a tu billetera.' },
  ],
  featuresTitle: '¿Por qué elegir SurveySui?',
  features: [
    { title: 'Cero costo para responder', desc: 'No necesitas criptomonedas para responder. El creador pre-deposita los fondos de recompensa y las tarifas las cubre la plataforma.' },
    { title: 'Datos almacenados de forma permanente', desc: 'Los datos se almacenan en la blockchain de Sui, inmutables y verificables por cualquiera.' },
    { title: 'Recompensas directas a tu billetera', desc: 'Distribuidas automáticamente por un contrato inteligente, sin necesidad de intermediarios ni aprobación manual.' },
  ],
  faqTitle: 'Preguntas frecuentes',
  faqs: [
    { q: '¿Necesito una billetera de criptomonedas?', a: 'Para responder necesitas una billetera Sui (descarga gratuita), pero no necesitas tener criptomonedas. Las tarifas las deposita el creador, por lo que participar es gratis para ti.' },
    { q: '¿Quién puede ver mis respuestas?', a: 'Las respuestas se encriptan antes de subirse. Solo el creador puede desencriptarlas; los demás solo ven estadísticas. Se guardan en la blockchain para garantizar transparencia.' },
    { q: '¿De dónde vienen las recompensas?', a: 'El creador deposita los fondos en el contrato inteligente antes de publicar. El contrato los distribuye automáticamente sin intervención humana.' },
    { q: '¿Cómo maneja la plataforma el costo de gas en la blockchain?', a: 'Usamos el mecanismo "pre-pago por el creador, pago delegado por BFF". El creador deposita el gas en el contrato inteligente, y la plataforma delega el pago para que el encuestado responda sin saldo. Como el gas no se puede predeterminar exactamente y hay riesgo de fallas, se calcula con un valor fijo conservador. La parte excedente del gas se utiliza como reserva del sistema, y el gas pre-pagado no utilizado se devuelve al creador al cerrar la encuesta.' },
  ],
}

export default landing
