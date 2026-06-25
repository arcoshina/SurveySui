---
title: Tarifas y patrocinio
order: 5
---

# Los creadores pagan, los encuestados responden gratis

## Los costes del creador

Se paga por completo una vez al crear la encuesta; la página de financiación enumera el desglose completo antes de firmar:

| Concepto | Importe | Destino |
|------|------|------|
| Presupuesto de recompensas | plazas × recompensa primera vez/repetida | Bloqueado en la bóveda de la encuesta, se paga a los encuestados |
| Tarifa de autorización | ~~20 %~~ del presupuesto de recompensas, ahora al 50 % de descuento: 10 % | Plataforma |
| Reserva de reembolso de gas | Estimada según plazas y precios de mercado | Bloqueada en la bóveda, se usa al patrocinar |
| Tarifa de almacenamiento en Walrus | Solo cuando la encuesta supera 10 KB | Red de almacenamiento Walrus |

**Las recompensas restantes son reembolsables**: al cerrar, el presupuesto de recompensas restante y la reserva de gas se devuelven al creador; al quemar la encuesta también recuperas el depósito de almacenamiento en cadena.

**Sin comisión si lo quemas tú mismo**: tres meses después de la fecha límite de la encuesta, la plataforma quemará automáticamente el contenido de la encuesta en nombre del creador, y cobrará una comisión de quema igual al 50 % del depósito de almacenamiento en cadena recuperado en el momento de la quema, tras descontar el gas.

## Coste cero para los encuestados

Hacemos todo lo posible para que los encuestados puedan responder con saldo 0; ambas operaciones en cadena tienen una cuota gratuita:

| Operación | Cuota gratuita | Cómo se calcula la cuota |
|------|----------|--------------|
| Acuñar / renovar SurveyPass | 2 veces | Patrocinado por la plataforma |
| Enviar una encuesta para cobrar | Gas + tarifa de almacenamiento | Patrocinado por el creador |

**¿Y si la cuota se agota o la plataforma se cae?** Si un encuestado decide que la recompensa menos el gas aún le compensa, puede pagar su propio gas para responder.

## Algunos detalles

- El recuento de la cuota vitalicia del Pass no tiene una tabla de datos centralizada; en su lugar, **cuenta el historial en cadena en tiempo real**: escanea las transacciones de la billetera para contar las entradas de mint/update «patrocinadas por la plataforma».
- La bóveda patrocina el gas de responder: por las restricciones del esquema de ejecución, la plataforma adelanta el gas al responder, y luego el contrato reembolsa `gas_compensation_amount` al patrocinador desde la reserva de gas de la bóveda de la encuesta.
- Límites de tasa: el endpoint de patrocinio es de 2 req/min, y 5 req/min por billetera; la cuota se reserva solo después de verificar la firma del usuario, evitando el exceso de cuota por concurrencia y el francotirador de cuota.
