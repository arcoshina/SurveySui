---
title: Lo destacado de Overflow 2026
order: 0
---

# Lo destacado de Overflow 2026

## Pagos programables de responder y cobrar

SurveySui agrupa la verificación anti-sybil -> el registro de la respuesta en cadena -> el pago de la recompensa en una sola interacción PTB, haciendo que las encuestas con recompensa sean simples y eficientes para ambas partes.

En SurveySui ya no respondes una encuesta y luego esperas a que el operador transfiera el dinero, sino que se trata de un pago condicional que verifica automáticamente la elegibilidad, evita el relleno fraudulento y libera los fondos en el momento en que se cumplen las condiciones. El pago de la recompensa lo ejecuta el contrato de forma condicional, sin necesidad de confiar en el creador ni en la plataforma.

## What We Built

Una **plataforma de encuestas en cadena** para pequeños emprendedores: los creadores escriben las encuestas en Markdown e inyectan un presupuesto de recompensas; incluso los encuestados que no son del mundo cripto pueden completar un primer flujo de responder y cobrar sin tener SUI. «Recolectar respuestas» y «pagar recompensas» dejan de ser una secuencia de pasos tediosa y costosa, y se convierten en una única transacción de información cuya finalización garantiza el contrato.

| Rol | Necesidad | Lo que hace |
|------|--------|-----|
| Creador | Recopilar información de mercado | Financiar, promocionar, organizar datos |
| Encuestado | Expresar opiniones | Responder, cobrar SSR |
| Administrador | Operar el servicio | Mantener el sistema y el fondo de reserva de recompensas |

## Why We Need It

### Un mercado ineficiente y con penetración aún baja

«Cuando se ofrece una recompensa, la tasa de respuesta de las encuestas sube notablemente y los datos son más detallados». Este es un nicho de mercado claro, dispuesto a pagar por muestras fiables.

Las encuestas pueden ofrecer información más detallada que el análisis de publicaciones. Sin embargo, los datos de una sola encuesta tienen poco valor, y los sistemas de encuestas tienen mucha fricción. Incluso cuando los encuestados optan por tarjetas de regalo que no requieren transferencia bancaria, todavía deben acumular muchos puntos para alcanzar el umbral de canje. Muchos encuestados abandonan porque nunca llegan al umbral, e incluso algunos sienten que el esfuerzo no compensa y sospechan que están siendo estafados.

SurveySui busca reconstruir el proceso existente con la eficiencia de la blockchain, para que los encuestados cobren su recompensa justo después de responder. Los encuestados no tienen que acumular hasta un umbral antes de retirar, ni pagar comisiones altas.

| Plataforma | Región | Escala estimada | Base | Fuente |
|-----|-----|-----:|--------|-----|
| Toluna Influencers | Global | 6 MUSD | Ingresos ~294M en 2026 | growjo |
| Swagbucks | EE. UU. | 3 MUSD | Ingresos ~65M en 2024 | rocketreach |
| Premise | Global | 2 MUSD | Ingresos ~30M en 2023 | getlatka |
| OpinionWorld | Taiwán | 5 MUSD | Afirma pagar ~5M al año | swiftsalary |
| iX:Panel | Taiwán | 2 MUSD | Estimación aproximada con 220k miembros | ixresearch |

El modelo de ingresos predominante en las encuestas con recompensa es el cobro por muestra completada, donde el precio unitario ya incluye el coste de la recompensa del encuestado y la comisión de la plataforma. La recompensa en sí es el motor central de este negocio, y la fiabilidad de ese motor es justo donde la cadena añade valor.

## How It Works

### Economía de tokens

El token de la plataforma es **SR** (Survey Reward). Los creadores gastan SUI para acuñar SR desde el pool de tokens; una vez acuñado, el SR se **bloquea** automáticamente en el pool, y el creador recibe **SSR** (Staked Survey Reward) que representa ese derecho. Los creadores preinyectan SSR en la bóveda dedicada de una encuesta como recompensa para los encuestados. El SSR que recibe un encuestado puede circular libremente, pero no puede canjearse directamente por SUI desde el pool de tokens.

El SUI gastado para acuñar SR también queda bloqueado en el pool de tokens como reserva. El precio de acuñación del SR lo determina la proporción SR / SUI dentro del pool. El equipo del proyecto puede desbloquear SUI del pool, recomprar SSR en el mercado y quemar una cantidad igual de SR y SSR del pool, manteniendo el mercado estable y predecible. Terceros pueden crear libremente pools de intercambio, y el equipo del proyecto no tiene poder para interferir.

### Diseño anti-sybil de SurveyPass

Cada billetera tiene un **SurveyPass** soulbound que puede vincular varias fuentes de identidad a la vez (Email, OAuth, World ID). SurveyPass escribe la identidad verificada en el registro como un hash unidireccional con sal, vinculando globalmente «una identidad, una billetera»; cada encuesta además hashea su propio nullifier independiente, garantizando que no haya respuestas duplicadas y dificultando la correlación entre encuestas.

Cuando un usuario necesita cambiar de billetera, puede quemar el SurveyPass completo y reacuñar la verificación en una billetera nueva. Quemar un SurveyPass no requiere autorización del equipo del proyecto: el propietario puede pagar para eliminarlo en cualquier momento.

### Diseño de cifrado/descifrado y seguridad de la encuesta

El cuerpo de una encuesta cifrada se cifra con `AES-256-GCM + una clave en el fragmento de la URL`; la cadena almacena el texto cifrado, el hash de las preguntas y la estructura del tipo de pregunta. Las respuestas usan cifrado híbrido `X25519 + ML-KEM-768 poscuántico`, y el creador puede descifrarlas solo con su billetera.

Cuando el frontend renderiza Markdown, escapa todo el HTML en bruto, intercepta protocolos de enlace maliciosos como javascript: / data: y enruta todas las imágenes externas a través de un proxy del backend, eliminando XSS y la inyección de scripts y enlaces. Una vez que el hash del contenido está en cadena no se puede alterar, lo que proporciona verificación de integridad. Si se detecta una discrepancia de hash, aparece una página de advertencia pero no se bloquea de forma rígida la respuesta.

### Mecanismo de patrocinio de gas

El gas que necesita un encuestado para responder lo patrocina primero el backend, que se reembolsa desde la bóveda prefinanciada por el creador. Si la bóveda se agota o el backend se desconecta, el encuestado aún puede decidir pagar su propio gas para responder.

## Características de Sui / Move

### 1. Flujo de fondos atómico con PTB

Los flujos de fondos de varios pasos se comprimen para completarse de forma atómica en una sola transacción, sin estados intermedios inconsistentes. La bóveda permanece como objeto de un solo propietario hasta que se completa la financiación, convirtiéndose en un shared object y volviéndose alcanzable públicamente solo después de financiarse; durante esa ventana es inalcanzable desde el exterior. La autorización de elegibilidad para el claim la imponen en cadena el tipo del Pass y el nullifier, no las reglas del backend. Combinado con Sponsored Transactions, el encuestado tiene saldo 0 todo el tiempo y solo necesita firmar una vez.

### 2. Pass soulbound + nullifier para anti-sybil

La verificación de elegibilidad reside por completo en el contrato; el backend solo emite credenciales de identidad, así que aunque se comprometa el backend no puede falsificar elegibilidad ni cobrar recompensas dos veces. Un nullifier con hash unidireccional y sal gestiona la vinculación global «una identidad, una billetera» y la deduplicación por encuesta; la cadena almacena solo el hash, no datos personales, y la identidad real no puede derivarse a la inversa de los datos en cadena. La intransferibilidad del Pass la garantiza el sistema de tipos (`has key` sin `store`), no las reglas del backend.

### 3. Aprovechamiento de recursos en cadena — storage rebate

Eliminación forzada de datos: la UI del frontend + comisiones altas por mora guían a los creadores a liberar espacio en cadena. Si un creador aún no ha quemado los datos tres meses después de finalizar la encuesta, el backend los quema a la fuerza y se queda con el 50 % del depósito tras descontar el coste como comisión. Si el backend falla, después de un año cualquiera puede disparar la quema. Las preguntas grandes se descargan a Walrus, dejando en cadena solo el índice blobId.

## Perspectivas de futuro

- Activar los activos bloqueados: además de SUI, añadir al pool de tokens activos que generan rendimiento similares a SuiUSDe, para que la reserva bloqueada deje de ser solo una garantía estática. El rendimiento que estos activos generan de forma continua puede revertir para respaldar el valor del SR, haciendo el pool de tokens más robusto sin emisión adicional.
- Segmentación de audiencia más fina: los creadores pueden fijar umbrales de respuesta según atributos autoinformados por el encuestado, como edad, región y ocupación. Esto permite dirigir el presupuesto de recompensas con precisión a la audiencia objetivo, elevando la representatividad y el valor comercial de las muestras recogidas.
- Anti-sybil más fuerte: sobre la vinculación de múltiples identidades existente, introducir una verificación de persona única de nivel KYC para prevenir aún más los ataques sybil a gran escala. Para encuestas de alto valor o muy sensibles, esto asegura que cada muestra proviene de un encuestado único y real.
- Añadir funciones de comunidad: a partir del historial de respuestas y las etiquetas de interés de los encuestados, la plataforma empareja y recomienda activamente encuestas adecuadas. Esto acorta la distancia entre los creadores y sus encuestados objetivo, a la vez que mejora la tasa de participación y la retención a largo plazo de los encuestados.
