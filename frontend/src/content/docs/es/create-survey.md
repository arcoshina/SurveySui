---
title: Crear una encuesta
order: 2
---

# Crear una encuesta

Flujo completo: diseñar la encuesta -> configurar recompensas -> financiar y publicar en cadena -> gestionar el progreso -> cerrar y finalizar.

## Paso 1: diseñar la encuesta

Las encuestas se escriben en un editor Markdown y admiten cuatro tipos de pregunta:

- Opción única: el encuestado elige una.
- Opción múltiple: se puede seleccionar más de una.
- Texto: entrada libre.
- Escala: por ejemplo, satisfacción de 1 a 5.

Las preguntas de opción admiten hasta 50 alternativas.
El sistema también admite ordenar las alternativas al azar para reducir el sesgo de orden.

Puedes optar por *cifrar las preguntas de la encuesta localmente* antes de subirlas a la cadena. Las preguntas de hasta 10 KB se almacenan directamente en cadena; las encuestas más grandes se almacenan automáticamente en Walrus, por lo que necesitarás tokens de Walrus para cubrir el coste de almacenamiento de las encuestas grandes. En cualquier caso, el hash de la encuesta se vincula a la bóveda. **Una vez publicada, una encuesta no se puede modificar.**

## Paso 2: configurar condiciones de participación y recompensas

Fecha límite: una encuesta es válida durante un máximo de 3 meses y deja de aceptar respuestas automáticamente al vencer.
Fuentes de verificación aceptadas: puedes elegir qué fuentes de verificación (Email, Google, GitHub, World ID) de usuarios aceptas, o exigir la tenencia de un NFT específico. Cuanto más fuerte sea la verificación exigida (como World Orb), más difícil será el relleno con cuentas falsas, pero también menor será tu audiencia.

Reglas de recompensa:
- Importe de recompensa por respuesta (lo que cobra cada encuestado que responde por primera vez).
- Número máximo de plazas (tope de presupuesto = plazas × recompensa por respuesta).
- Respuesta repetida (opcional): permite que la misma persona responda de nuevo y cobre una recompensa repetida menor, adecuado para estudios de seguimiento.

## Paso 3: financiar y publicar en cadena

Tras completar la configuración, entras en la página de financiación, donde el sistema enumera el coste total estimado.
Una vez confirmado, las siguientes acciones se completan dentro de la misma interacción (todas tienen éxito o se cancela el conjunto; no hay un estado intermedio en el que «fallaron algunos pasos»):

1. Gastar SUI para acuñar el token de recompensa SSR.
2. Crear la bóveda (Vault) dedicada de la encuesta e inyectar la recompensa SSR.
3. Inyectar la reserva de reembolso de gas.
4. Pagar la comisión de protocolo del 20 %, actualmente a mitad de precio.
5. Registrar el contenido de la encuesta (hash vinculado a la bóveda).
6. Abrir la bóveda para que el público responda.

Después obtendrás un enlace de la encuesta que puedes compartir directamente.

Consejo: si las preguntas de la encuesta también están cifradas, la parte de la URL después del `#` es la clave de descifrado; ten cuidado de no filtrarla.

## Paso 5: cerrar y finalizar

El panel muestra en tiempo real: número de respuestas, tasa de finalización, recompensas pagadas, presupuesto restante y la cuenta atrás hasta la fecha límite.

Cerrar (Close): el creador puede cerrar en cualquier momento; tras cerrar, el presupuesto de recompensas restante y la reserva de gas se devuelven a tu billetera, y la encuesta deja de aceptar respuestas. Una vez pasada la fecha límite, cualquiera puede disparar el cierre, pero los fondos se te devuelven igualmente a ti.

Ver resultados: en la página de resultados, descifra todas las respuestas con tu clave, con estadísticas básicas integradas.

Quemar: tras cerrar, puedes quemar las preguntas y **respuestas** de la encuesta. La quema se ejecuta por lotes de 500 respuestas; el último lote quema la bóveda y el objeto de la encuesta y recupera el depósito (storage rebate) del almacenamiento en cadena que se ocupaba. Si lo dejas sin atender, la plataforma lo limpiará automáticamente tras el periodo de gracia. Al excedente, después de descontar el coste de ejecución, se le *retiene un 50 % como comisión*, así que recuerda quemar los datos sin falta.
