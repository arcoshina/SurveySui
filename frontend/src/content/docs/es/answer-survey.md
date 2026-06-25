---
title: Responder y cobrar
order: 3
---

# Responder y cobrar

Responde una encuesta, cobra una recompensa: **no necesitas nada de gas en tu billetera**.

## Resumen del flujo

1. Abre el enlace de la encuesta: la página muestra la descripción de la encuesta, el importe de la recompensa y las plazas restantes.
2. Conecta tu billetera: si no tienes una, recomendamos crear rápidamente una billetera Slush con una cuenta de Google.
3. (Primera vez) Obtén tu SurveyPass: elige un método de verificación; recomendamos OAuth social, que también te da la verificación por Email. Tras verificar, se acuña en cadena un SurveyPass que te pertenece. Las distintas fuentes tienen periodos de validez diferentes y necesitan renovarse al vencer. Las dos primeras acuñaciones las patrocina la plataforma. Consulta el artículo «Verificación de identidad y SurveyPass» para más detalles.
4. Responde y envía: al enviar, tu billetera muestra una solicitud de firma. El gas de esta transacción lo patrocina el creador (salvo en respuestas muy grandes).
5. Recibe la recompensa al instante: una vez que la transacción está en cadena, el contrato inteligente de la encuesta verifica tu respuesta y transfiere el token de recompensa SSR desde la bóveda de la encuesta a la dirección de tu billetera.

## ¿Por qué no pago comisión?

Las transacciones de blockchain necesitan una pequeña cantidad de SUI como comisión de cómputo (gas). SurveySui usa el mecanismo de **transacciones patrocinadas** de Sui: el creador prefinancia un reembolso de gas al crear la encuesta, la plataforma adelanta tu comisión primero y luego se reembolsa desde esa reserva.

Si el servidor de patrocinio de la plataforma se desconecta, puedes usar el SUI de tu billetera para pagar tu propio gas, y aun así recibirás la recompensa SSR una vez que tu respuesta esté en cadena.

## ¿Quién puede ver mis respuestas?

Para encuestas con cifrado de respuestas activado:
- El cifrado ocurre en tu dispositivo, y el texto cifrado se envía a la cadena.
- Solo el creador de la encuesta posee la clave de descifrado; la plataforma y cualquier otra persona **no pueden** descifrar tu respuesta.
- La cadena almacena el Email y la cuenta social ya **hasheados**, así que los datos en cadena solo revelan una dirección de billetera y no pueden rastrearse hasta tu identidad.

Para encuestas totalmente públicas:
- Cualquiera puede ver tu respuesta.
- También puede ver tu dirección de billetera.
- La cadena almacena el Email y la cuenta social ya **hasheados**, por lo que aún no puede rastrearse directamente hasta tu identidad, *pero podría ser posible inferir tu identidad a partir del contenido de la respuesta*.
**No reveles ninguna información privada en una encuesta pública.**

## ¿Qué es el SSR que recibí?

SSR (Staked Survey Reward) es el token de recompensa de la plataforma, acuñado en el pool de reserva a partir del SUI que invirtió el creador. Actualmente puedes:

- Conservar: el SSR permanece en tu billetera y podrá usarse cuando las funciones se amplíen en el futuro.
- Comerciar: el SSR se puede transferir y comerciar libremente.
- Crear encuestas: el SSR se puede usar directamente como presupuesto de recompensa al crear una encuesta, sin necesidad de comprar SUI para canjear.

Nota: el SSR no se puede canjear directamente por SUI; entiéndelo como puntos de recompensa dentro del ecosistema de la plataforma.

## ¿Puedo responder la misma encuesta dos veces?

Por defecto, una respuesta por persona. Pero si el creador ha activado la «respuesta repetida», puedes responder de nuevo dentro del número de veces permitido y cobrar la recompensa repetida que fijó el creador. Cuántas veces se permiten se muestra en la página de la encuesta.
