---
title: SurveyPass, token de identidad
order: 4
---

# SurveyPass, token de identidad

SurveyPass es un pase en cadena creado por SurveySui: un Soulbound Token **intransferible**. Permite a los creadores de encuestas confirmar que «cada respuesta proviene de un usuario distinto» sin exponer ninguno de tus datos personales.

Un solo SurveyPass puede llevar varias verificaciones a la vez (por ejemplo, verificar primero con Email y luego añadir Google); cuando una credencial vence, basta con volver a verificar para extenderla.
Un SurveyPass se puede quemar por ti mismo en cualquier momento, lo que puede generar una pequeña comisión anti-sybil.

Si la clave privada o la frase semilla de tu billetera se filtran, puedes eliminar el SurveyPass en el sitio web. Pero si una cuenta de fuente de verificación se filtra y no puedes cambiar esa cuenta, puedes contactar con la plataforma para revocar permanentemente la verificación del SurveyPass.

## Cuatro métodos de verificación

| Método | Flujo | Nivel de confianza | Validez |
|------|------|----------|--------|
| Email | Recibir un código (OTP) e introducirlo | Tier 0 | 3 meses |
| Google | Inicio de sesión con autorización OAuth | Tier 1 | 3 meses |
| GitHub | Inicio de sesión con autorización OAuth | Tier 1 | 3 meses |
| World ID | Prueba de persona real con World App | Tier 2 | 365 días |

Recomendamos usar una cuenta de Google o GitHub: cómodo y común (algunas encuestas o políticas de patrocinio de la plataforma pueden exigir Tier 1), y a la vez te da la verificación por Email.
World Orb ofrece la prueba de persona real más fuerte y la validez más larga.
Email es adecuado para encuestas con bajos requisitos anti-sybil; es el nivel de «mejor tenerlo que no».

## Diseño de privacidad: tus datos personales no están en cadena

Durante la verificación, tu Email o cuenta social se usa solo en el momento de la verificación y **no se almacena en cadena**. Lo que la cadena registra es un identificador llamado nullifier, derivado de tu cuenta real (con sal) mediante un hash SHA-256:

- La misma cuenta siempre produce el mismo nullifier.
- El nullifier no se puede revertir hasta tu cuenta, ni siquiera con un ordenador cuántico (conocido).
- Cuando respondes una encuesta se hashea una vez más, así que no se puede rastrear el comportamiento del mismo nullifier en distintas encuestas (aunque sí se pueden rastrear las interacciones en cadena de una billetera).

Este es el mecanismo que «encubre tu identidad real».

## Coste de acuñación y patrocinio

Acuñar un Pass requiere una transacción en cadena. La plataforma ofrece **2 patrocinios gratuitos por billetera de por vida** (acuñación + renovación comparten esta cuota), así que los usuarios normales no pagan nada al principio. Una vez superada la cuota, si necesitas renovar una credencial, tendrás que pagar tu propio gas (por ejemplo, vendiendo recompensas de encuestas o comprando SUI).

## Eliminar un SurveyPass

Puedes eliminar tu propio SurveyPass en cualquier momento (por ejemplo, al cambiar de billetera). Ten en cuenta:

- SurveyPass acuñado por ti mismo: se elimina directamente, sin comisión adicional.
- SurveyPass acuñado con patrocinio de la plataforma: como eliminar un objeto en cadena genera un reembolso del depósito de almacenamiento (que vuelve al financiador), un Pass patrocinado debe eliminarse a través de la plataforma, o pagas tú mismo una comisión de escape en cadena para eliminarlo (el importe real depende del coste de patrocinio en el momento de la acuñación).
- Tras la eliminación, el nullifier de una credencial **válida** se libera, y la misma cuenta puede volver a verificarse; una cuenta revocada no puede empezar de cero eliminándolo.
