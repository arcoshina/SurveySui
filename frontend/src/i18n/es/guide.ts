import { CHROME_STORE_URL, SLUSH_SITE_URL } from '../zh/guide'
import type { GuideDict } from '../zh/guide'

const guide: GuideDict = {
  title: 'Guía para principiantes: Cómo crear tu billetera Sui',
  intro:
    'SurveySui es una plataforma de encuestas creada en la blockchain pública de Sui. Solo necesitas una billetera Sui gratuita para conectarte, obtener tu SurveyPass y comenzar a responder encuestas de forma totalmente gratuita. Las tarifas de transacción las paga el creador de la encuesta. A continuación, te mostramos los 5 pasos para comenzar rápidamente con zkLogin (inicio de sesión con Google) a través de la billetera Slush, sin necesidad de frases mnemónicas ni criptomonedas.',
  stepLabel: 'Paso',
  steps: [
    {
      title: 'Instalar la extensión de la billetera Slush',
      desc: 'Slush es una billetera oficial para navegador de Sui (anteriormente Sui Wallet). Ve a la Chrome Web Store para instalar la extensión y fíjala en la barra de herramientas para un fácil acceso. También puedes visitar slush.app para obtener más información.',
      links: [
        { label: 'Instalar desde Chrome Store', url: CHROME_STORE_URL, icon: 'chrome' },
        { label: 'Sitio oficial de Slush', url: SLUSH_SITE_URL },
      ],
    },
    {
      title: 'Crear billetera con una cuenta social (ej. Google)',
      desc: 'Abre Slush y selecciona "Social Login". Utiliza la tecnología de prueba de conocimiento cero zkLogin para generar una dirección Sui directamente con tu cuenta de Google (o Apple, Facebook, Twitch), sin necesidad de gestionar frases semilla ni claves privadas, ideal para principiantes. Una vez completada la autorización con Google, tu billetera estará lista.',
      links: [{ label: 'Iniciar sesión en Slush', url: SLUSH_SITE_URL }],
    },
    {
      title: 'Conectar la billetera',
      desc: 'Regresa a SurveySui, haz clic en el botón "Conectar Billetera" en la esquina superior derecha, selecciona Slush en la lista y autoriza la conexión. Una vez conectada, verás la dirección de tu billetera en la esquina superior derecha.',
      links: [],
    },
    {
      title: 'Acerca de SurveyPass',
      desc: 'SurveyPass es una credencial de verificación de identidad de un solo uso que se requiere antes de responder, garantizando que cada participante responda solo una vez y evitando la duplicación de recompensas. Completa la verificación en la página "SurveyPass" para obtenerla de forma gratuita.',
      links: [],
    },
    {
      title: 'Responder la encuesta',
      desc: 'Abre la encuesta en la que deseas participar y comienza a responder. Una vez enviada, el contrato inteligente procesará la transacción automáticamente y las recompensas se enviarán directamente a tu billetera sin costo de gas para ti.',
      links: [],
    },
  ],
  ctaAuth: 'Ir a la verificación de SurveyPass',
  ctaHome: 'Volver al inicio',
}

export default guide
