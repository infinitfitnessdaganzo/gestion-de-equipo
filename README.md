# Control de entrenadores · Infinit Fitness Daganzo

App estática para GitHub Pages. Los datos se guardan en Supabase, en el proyecto
`Infinit-fitness-daganzo` (`filakxlgdewfurlcqptk`).

## Puesta en marcha

1. Ejecuta `supabase.sql` en **SQL Editor** del proyecto. Crea la tabla
   `public.ep_daganzo_estado` y sus permisos.
2. En **Authentication → Users**, comprueba que existe un usuario de correo y
   contraseña para `fernando.daganzo@infinitfitness.com.es`. Ese correo tiene
   acceso a la app. El acceso al panel de Supabase y el acceso a la app son
   credenciales distintas.
3. Sube los archivos al nuevo repositorio y configura el alojamiento estático
   de GitHub Pages para servir la raíz de la rama principal.
4. Desde el enlace de la app, inicia sesión y comprueba que aparece el equipo.

`config.js` contiene la clave pública del proyecto. El acceso a los registros
se comprueba en Supabase mediante autenticación y políticas RLS.

## Uso

- Empieza asignando socios a César o Salma. Si un socio cambia de modalidad o
  entrenador, finaliza su asignación anterior y crea otra con la fecha de inicio.
  Usa el mismo número de socio para mantener un único total mensual.
- Registra la fecha y duración real de cada sesión. En Duo puedes incluir a
  dos socios en el mismo registro. Cada socio recibe el crédito por la sesión y
  el entrenador acumula el tiempo impartido una vez.
- Los paquetes habituales son de 4 u 8 horas. Usa **Ajustar mes** para cambiar
  las horas previstas solo para el mes seleccionado.
- Registra vacaciones y ausencias completas mediante rangos inclusivos de días.
  Para una ausencia parcial indica su duración en minutos.
- Archiva entrenadores para conservar su historial. Las asignaciones vigentes
  se cierran antes de archivar al entrenador.

El resumen muestra Duo y One por separado. Los importes dependen de las reglas
económicas que se definan para cada modalidad.
