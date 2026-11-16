# Gestión de equipo · Finifinders

Aplicación de gestión en GitHub Pages. Los datos se guardan en el proyecto Supabase
`Infinit-fitness-daganzo` (`filakxlgdewfurlcqptk`) con el esquema de `supabase.sql`.
La cuenta de gestión usa el acceso por correo y contraseña de Supabase Auth.

## Gestión mensual

- Crea una ficha con el número de socio, nombre y apellidos, entrenador, paquete y fecha de inicio.
  La fecha final es opcional. Si cambian las condiciones de un paquete, finaliza la asignación y crea otra.
- Duo 1H y One 1H cuentan como 4 entrenamientos mensuales. Duo 2H y One 2H cuentan como 8.
- El mes incluye las asignaciones vigentes en algún momento de ese mes. Aplica un descuento mensual
  del 25 %, 50 %, 75 % o 100 % al paquete cuando corresponda. Un descuento del 0 % devuelve el total del paquete.
- El resumen suma los entrenamientos descontados por socio y muestra los totales por entrenador y paquete.
  Cada socio Duo aporta su propio paquete al recuento.
- Las vacaciones y ausencias completas usan rangos inclusivos. Las ausencias parciales se indican en minutos.

## Importes para nómina

Configura los importes mensuales por paquete desde el resumen. Cada cambio se aplica desde el mes elegido.
El descuento mensual reduce el importe por socio. El total para nómina suma esos importes por entrenador.

En **Opciones** se administran los entrenadores y las tarifas. Desde el resumen se puede
cerrar el mes de cada entrenador y consultar el desglose guardado de cada socio.
Los cierres conservan las tarifas, descuentos e importes usados en el momento del cierre.
