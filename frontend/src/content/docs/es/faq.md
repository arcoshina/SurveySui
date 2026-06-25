---
title: Preguntas frecuentes
order: 6
---

# Preguntas frecuentes

## ¿Por qué necesito una billetera?
La recompensa es un token que se paga en cadena, y tu billetera es tu cuenta de cobro; al mismo tiempo, la firma de la billetera sustituye a las contraseñas de cuenta tradicionales y es la forma en que autorizas cada operación. La plataforma no custodia ninguno de tus activos ni claves.

## ¿Se puede convertir la recompensa SSR en efectivo?
La plataforma no ofrece esa vía. SR y SSR son tokens de recompensa del ecosistema de la plataforma; por ahora puedes conservarlos o usarlos directamente como presupuesto para encuestas que tú mismo crees. No hay función para canjearlos directamente por SUI, así que entiende su valor implícito como «puntos dentro del ecosistema». La buena noticia, eso sí, es que la plataforma no puede interferir con la transferencia y el comercio libres de SSR.

## ¿Se puede usar sin ninguna criptomoneda en absoluto?
Sí. Los encuestados nunca necesitan tener SUI. La tarifa de gas de responder la patrocina el creador, y las dos primeras verificaciones de identidad las patrocina la plataforma. Solo necesitas una billetera (recomendamos a los principiantes empezar con la extensión de billetera Slush junto con zkLogin de cuenta social, y luego tomarse un tiempo para aprender bien las reglas de la blockchain).

## ¿Quién puede ver mis respuestas?
Las respuestas de una encuesta pública las puede ver cualquiera.
Si una respuesta está configurada como cifrada, se cifra en tu navegador antes de enviarse, y la clave de descifrado la tiene el creador a través de su billetera, así que en circunstancias normales solo el creador de la encuesta puede verla.
La cadena solo almacena un identificador de identidad hasheado, que no puede revertirse hasta un Email o cuenta social.

## ¿Puedo responder la misma encuesta dos veces?
Por defecto, una respuesta por persona. Si el creador activa la «respuesta repetida», puedes responder de nuevo dentro del número de veces permitido y cobrar la recompensa repetida. Cambiar de billetera o de cuenta para cobrar otra vez no funciona: la elegibilidad está vinculada a tu identidad verificada, y el mismo Email / cuenta social cuenta como una persona en la misma encuesta.

## Me rechazaron la elegibilidad para responder, ¿por qué?
Motivos comunes: las plazas están llenas, la encuesta ha terminado, tu método de verificación no está en la lista aceptada por el creador (por ejemplo, la encuesta exige World ID pero tú solo vinculaste Email), o ya has respondido. La página de la encuesta mostrará el motivo concreto.

## ¿La encuesta y las respuestas se quedan en cadena para siempre?
No. Tras cerrar una encuesta, el creador o la plataforma queman el objeto de la encuesta y eliminan los datos de respuesta en cadena. Los creadores que necesiten conservar los resultados deben exportarlos antes de quemar.

## ¿Cuál es el mínimo de SUI necesario para crear una encuesta?
Coste = presupuesto de recompensas + comisión de protocolo + reserva de reembolso de gas (estimada según las plazas). El sitio web muestra el importe exacto antes de firmar. Todo presupuesto y gas que la encuesta no haya usado se reembolsa por completo al cerrar.

## ¿Puede el creador incumplir y no pagar la recompensa?
No. El presupuesto se bloquea en la bóveda en cadena al crear la encuesta, y el pago lo ejecuta el contrato inteligente dentro de la misma transacción en la que envías tu respuesta; el creador no tiene ningún paso para interceptarlo ni revisarlo. Lo único que puede hacer el creador es cerrar la encuesta; las recompensas ya pagadas no se pueden recuperar.

## Si la plataforma cierra, ¿desaparecerán mis recompensas?
Las recompensas ya recibidas en tu billetera están registradas en la blockchain y no dependen de los servidores de la plataforma. La verificación de elegibilidad y la lógica de pago están ambas en contratos en cadena, así que aunque la plataforma se desconecte, los usuarios pueden seguir interactuando directamente con los contratos hasta que su SurveyPass venza.

## ¿Ya se ha lanzado oficialmente?
Todavía no. La plataforma funciona actualmente en la testnet de Sui: los tokens no tienen valor real por ahora. Todos los datos y cuotas podrían reiniciarse a cero antes del lanzamiento oficial, así que no guardes nada de valor.
