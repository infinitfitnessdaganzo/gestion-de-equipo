# Control de entrenadores � Infinit Fitness Daganzo

App est�tica para GitHub Pages. Los datos se guardan en Supabase, en el proyecto
`Infinit-fitness-daganzo` (`filakxlgdewfurlcqptk`).

## Puesta en marcha

1. Ejecuta `supabase.sql` en **SQL Editor** del proyecto. Crea la tabla
   `public.ep_daganzo_estado` y sus permisos.
2. En **Authentication  Users**, comprueba que existe un usuario de correo y
   contrase�a para `fernando.daganzo@infinitfitness.com.es`. Ese correo tiene
   acceso a la app. El acceso al panel de Supabase y el acceso a la app son
   credenciales distintas.
3. Sube los archivos al nuevo repositorio y configura el alojamiento est�tico
   de GitHub Pages para servir la ra�z de la rama principal.
4. Desde el enlace de la app, inicia sesi�n y comprueba que aparece el equipo.

`config.js` contiene la clave p�blica del proyecto. El acceso a los registros
se comprueba en Supabase mediante autenticaci�n y pol�ticas RLS.

## Uso

- Empieza asignando socios a C�sar o Salma. Si un socio cambia de modalidad o
  entrenador, finaliza su asignaci�n anterior y crea otra con la fecha de inicio.
  Usa el mismo n�mero de socio para mantener un �nico total mensual.
- Registra la fecha y duraci�n real de cada sesi�n. En Duo puedes incluir a
  dos socios en el mismo registro. Cada socio recibe el cr�dito por la sesi�n y
  el entrenador acumula el tiempo impartido una vez.
- Los paquetes habituales son de 4 u 8 horas. Usa **Ajustar mes** para cambiar
  las horas previstas solo para el mes seleccionado.
- Registra vacaciones y ausencias completas mediante rangos inclusivos de d�as.
  Para una ausencia parcial indica su duraci�n en minutos.
- Archiva entrenadores para conservar su historial. Las asignaciones vigentes
  se cierran antes de archivar al entrenador.

El resumen muestra Duo y One por separado. Los importes dependen de las reglas
econ�micas que se definan para cada modalidad.
