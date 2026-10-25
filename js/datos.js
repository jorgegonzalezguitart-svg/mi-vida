// Categorías de documentos
export const CATEGORIAS = [
  { id: 'identidad', nombre: 'Identidad', icono: '🪪' },
  { id: 'casa', nombre: 'Casa', icono: '🏠' },
  { id: 'militar', nombre: 'Carrera militar', icono: '🎖️' },
  { id: 'trabajo', nombre: 'Títulos y estudios', icono: '🎓' },
  { id: 'dinero', nombre: 'Dinero y Hacienda', icono: '💶' },
  { id: 'coche', nombre: 'Coche', icono: '🚗' },
  { id: 'salud', nombre: 'Salud', icono: '🩺' },
  { id: 'otros', nombre: 'Otros', icono: '📦' },
];

// "Por subir": lo que conviene tener guardado y de dónde sacarlo.
// Al subir un documento desde aquí queda marcado como hecho.
export const LISTA = [
  // Identidad
  { clave: 'dni', categoria: 'identidad', titulo: 'DNI',
    como: 'Haz foto de las dos caras con buena luz, sobre fondo oscuro. Apunta el número y la fecha de caducidad.' },
  { clave: 'pasaporte', categoria: 'identidad', titulo: 'Pasaporte',
    como: 'Foto de la página con tu foto y datos. Apunta la fecha de caducidad.' },
  { clave: 'carnet', categoria: 'identidad', titulo: 'Carnet de conducir',
    como: 'Foto de las dos caras, o desde la app miDGT: "Mis permisos" → carnet digital (haz captura).' },
  { clave: 'tarjeta_sanitaria', categoria: 'identidad', titulo: 'Tarjeta sanitaria',
    como: 'Foto de la tarjeta, o desde la app de salud de tu comunidad (en Andalucía: ClicSalud+).' },
  { clave: 'tse', categoria: 'identidad', titulo: 'Tarjeta Sanitaria Europea',
    como: 'Foto de la tarjeta. Si no la tienes, se pide gratis en la web de la Seguridad Social (Importass). Caduca.' },
  { clave: 'tim', categoria: 'identidad', titulo: 'TIM (Tarjeta de Identidad Militar)',
    como: 'Foto de las dos caras. Apunta la fecha de caducidad que viene en la tarjeta.' },
  { clave: 'certificado_digital', categoria: 'identidad', titulo: 'Certificado digital',
    como: 'El archivo .pfx o .p12 de tu certificado (FNMT o DNIe). Apunta su caducidad: suelen durar 4 años.' },

  // Carrera militar
  { clave: 'tarjeta_piloto', categoria: 'militar', titulo: 'Tarjeta de aptitud de piloto',
    como: 'El PDF firmado que te dio la Dirección de Enseñanza, junto con el certificado de revalidación en vigor.' },
  { clave: 'medico_vuelo', categoria: 'militar', titulo: 'Reconocimiento médico de vuelo',
    como: 'El acta del CIMA. Pon como caducidad la fecha del próximo reconocimiento.' },
  { clave: 'revalidacion', categoria: 'militar', titulo: 'Certificado de revalidación de aptitud',
    como: 'Pídelo en tu unidad o en la escuadrilla. Pon su fecha de caducidad.' },
  { clave: 'libro_vuelo', categoria: 'militar', titulo: 'Libro de vuelo / resumen de horas',
    como: 'Captura o PDF del resumen de horas de vuelo (pídelo en la unidad). Conviene actualizarlo cada cierto tiempo.' },
  { clave: 'hoja_servicios', categoria: 'militar', titulo: 'Hoja de servicios',
    como: 'Desde la intranet (SIPERDEF) o pídela en la unidad: tu historial de destinos, cursos y ascensos.' },
  { clave: 'idiomas', categoria: 'militar', titulo: 'Perfil de idioma (SLP)',
    como: 'El certificado de tu perfil lingüístico de inglés. Caduca: apunta la fecha.' },
  { clave: 'isfas', categoria: 'salud', titulo: 'Tarjeta ISFAS',
    como: 'App ISFAS → tarjeta digital (captura), o foto de la tarjeta. Indica también tu entidad médica (concierto).' },

  // Casa
  { clave: 'vivienda', categoria: 'casa', titulo: 'Escrituras o contrato de alquiler',
    como: 'El PDF del notario o del contrato. Si solo lo tienes en papel, foto de cada página.' },
  { clave: 'hipoteca', categoria: 'casa', titulo: 'Escritura de la hipoteca',
    como: 'PDF de la notaría o de la app del banco. Apunta en notas el tipo de interés y la fecha de la última cuota.' },
  { clave: 'cee', categoria: 'casa', titulo: 'Certificado de eficiencia energética',
    como: 'Te lo debe dar el vendedor (es obligatorio al vender). Si no lo tienes, búscalo en el registro de la Junta de Andalucía. Caduca a los 10 años.' },
  { clave: 'comunidad', categoria: 'casa', titulo: 'Datos de la comunidad de vecinos',
    como: 'Contacto del administrador, cuota y estatutos. Una foto del último recibo vale.' },
  { clave: 'luz', categoria: 'casa', titulo: 'Contrato de la luz',
    como: 'App o área de clientes de tu compañía de luz → contrato en PDF. Sube también la última factura: lleva el CUPS y la potencia contratada.' },
  { clave: 'gas', categoria: 'casa', titulo: 'Contrato del gas',
    como: 'App o área de clientes de tu compañía de gas → contrato en PDF + la última factura (lleva el CUPS del gas). Si tienes luz y gas en la misma factura, basta con una.' },
  { clave: 'agua', categoria: 'casa', titulo: 'Contrato del agua',
    como: 'Oficina virtual de tu empresa de aguas → contrato o última factura en PDF.' },
  { clave: 'internet', categoria: 'casa', titulo: 'Contrato de internet y móvil',
    como: 'App de tu operadora → Mis productos / Contratos → descargar PDF. Apunta la fecha de fin de permanencia como caducidad.' },
  { clave: 'seguro_hogar', categoria: 'casa', titulo: 'Seguro del hogar',
    como: 'App o web de tu aseguradora → Área de clientes → tu póliza de hogar → descarga las condiciones particulares (PDF) y el último recibo. Pon la fecha de renovación como caducidad y apunta en notas el teléfono de asistencia.' },
  { clave: 'ibi', categoria: 'casa', titulo: 'Recibo del IBI',
    como: 'Web de tributos de tu ayuntamiento o de tu banco (recibos domiciliados) → descargar PDF.' },

  // Trabajo y estudios
  { clave: 'titulos', categoria: 'trabajo', titulo: 'Títulos académicos',
    como: 'Foto o escaneo de cada título (Bachillerato, grado, cursos…). Si tienes el PDF oficial de la universidad, mejor.' },
  { clave: 'vida_laboral', categoria: 'trabajo', titulo: 'Informe de vida laboral',
    como: 'App "Mi Seguridad Social" o la web Importass → Vida laboral → descargar PDF (se puede entrar con Cl@ve).' },
  { clave: 'contrato_trabajo', categoria: 'trabajo', titulo: 'Contrato de trabajo',
    como: 'El PDF que te dio la empresa, o pídelo en el portal del empleado.' },
  { clave: 'nominas', categoria: 'trabajo', titulo: 'Últimas nóminas',
    como: 'Portal del empleado de tu empresa → descargar las 3 últimas en PDF.' },
  { clave: 'curriculum', categoria: 'trabajo', titulo: 'Currículum actualizado',
    como: 'Tu CV en PDF.' },

  // Dinero y Hacienda
  { clave: 'renta', categoria: 'dinero', titulo: 'Última declaración de la renta',
    como: 'App "Agencia Tributaria" → Renta → "Consultar declaraciones presentadas" → descargar PDF.' },
  { clave: 'titularidad', categoria: 'dinero', titulo: 'Certificado de titularidad de cuenta',
    como: 'App de tu banco → Cuenta → Documentos / Certificados → certificado de titularidad (con tu IBAN).' },
  { clave: 'inversiones', categoria: 'dinero', titulo: 'Extracto de inversiones',
    como: 'App de tu bróker o banco → Cartera / Posición → exportar o descargar extracto en PDF o Excel.' },
  { clave: 'pensiones', categoria: 'dinero', titulo: 'Plan de pensiones',
    como: 'App de la gestora o del banco → certificado anual del plan en PDF.' },

  // Coche
  { clave: 'permiso_circulacion', categoria: 'coche', titulo: 'Permiso de circulación',
    como: 'App miDGT → "Mis vehículos" → permiso digital, o foto del papel.' },
  { clave: 'itv', categoria: 'coche', titulo: 'Ficha técnica e ITV',
    como: 'Foto de la ficha técnica y de la última ITV. Pon la fecha de la próxima ITV como caducidad.' },
  { clave: 'seguro_coche', categoria: 'coche', titulo: 'Seguro del coche',
    como: 'App o web de tu aseguradora → Área de clientes → póliza del coche → descarga las condiciones particulares y el certificado del seguro (PDF). Pon la fecha de renovación como caducidad y apunta en notas el teléfono de asistencia en carretera.' },

  // Salud
  { clave: 'vacunas', categoria: 'salud', titulo: 'Certificado de vacunación',
    como: 'App de salud de tu comunidad (ClicSalud+) → Vacunas → descargar certificado.' },
  { clave: 'informes', categoria: 'salud', titulo: 'Informes médicos importantes',
    como: 'App de salud de tu comunidad → Informes, o foto de los que tengas en papel.' },
  { clave: 'seguro_salud', categoria: 'salud', titulo: 'Seguro médico privado',
    como: 'App de la aseguradora → tarjeta digital (captura) y póliza en PDF.' },

  // Otros
  { clave: 'seguro_vida', categoria: 'otros', titulo: 'Seguro de vida',
    como: 'Póliza en PDF desde el banco o la aseguradora. Pon la fecha de renovación como caducidad.' },
];

// Región aproximada de cada fondo (por su nombre), para el gráfico de reparto
export function regionDe(p) {
  const n = `${p.nombre || ''}`.toLowerCase();
  if (p.tipo === 'cripto') return 'Cripto';
  if (/emerging|emergent/.test(n)) return 'Emergentes';
  if (/japan|jap[oó]n/.test(n)) return 'Japón';
  if (/pacific|pac[ií]fico/.test(n)) return 'Pacífico (sin Japón)';
  if (/europe|europa/.test(n)) return 'Europa';
  if (/developed world|msci world|mundo/.test(n)) return 'Mundo desarrollado';
  if (/u\.?s\.?|s&p|500|usa|ee\.? ?uu/.test(n)) return 'EE. UU.';
  return 'Otros';
}

// Fuentes de noticias: palabras que hacen que una noticia sea relevante para una estrategia indexada
export const PALABRAS_NOTICIAS = [
  ['indexad', 4], ['msci', 4], ['world', 2], ['emergent', 3], ['s&p', 3], ['vanguard', 4], ['ishares', 4],
  ['blackrock', 2], ['fondo', 2], ['etf', 3], ['wall street', 2], ['bolsa', 1], ['nasdaq', 2], ['bce', 2],
  ['fed', 2], ['reserva federal', 2], ['tipos de inter', 2], ['inflaci', 1], ['japón', 1], ['jap', 1],
  ['bitcoin', 2], ['hacienda', 2], ['irpf', 3], ['plusval', 3],
  ['traspaso', 3], ['comisi', 1], ['jubilaci', 1], ['pensiones', 1], ['dca', 3], ['largo plazo', 2],
];

// Lecturas recomendadas sobre IA e inversión (buscadas y revisadas el 25/10/2026)
export const LECTURAS_IA = [
  {
    titulo: 'The active construction of passive investors: roboadvisors and algorithmic "low-finance"',
    fuente: 'Socio-Economic Review (2021) · artículo académico', idioma: 'EN',
    url: 'https://cris.iucc.ac.il/en/publications/the-active-construction-of-passive-investors-roboadvisors-and-alg/',
    resumen: 'Cómo los roboadvisors (carteras automatizadas) automatizan decisiones y empujan a no operar: justo la filosofía de la indexación.',
  },
  {
    titulo: 'Robo-advising: estudio con datos reales de brokers (incluye la crisis de 2008)',
    fuente: 'arXiv · UNC Kenan-Flagler y UCLouvain', idioma: 'EN',
    url: 'https://arxiv.org/abs/1907.03370v1',
    resumen: 'Compara cómo invierten las personas solas frente a con un robo-advisor. Útil para entender qué aporta automatizar y qué no.',
  },
  {
    titulo: 'Bots are forging the next generation of index funds',
    fuente: 'InvestmentNews', idioma: 'EN',
    url: 'https://www.investmentnews.com/?p=78779',
    resumen: 'Cómo los proveedores de índices (por ejemplo, Kensho de S&P Global) usan algoritmos para diseñar índices. La IA, más que sustituir a la indexación, la está construyendo.',
  },
  {
    titulo: 'La IA no operará en los mercados mejor que Wall Street',
    fuente: 'Bloomberg Línea · opinión (2023)', idioma: 'ES',
    url: 'https://bloomberglinea.com/2023/05/08/la-ia-no-operara-en-los-mercados-mejor-que-wall-street/',
    resumen: 'Argumenta con datos de Morningstar que la mayoría de gestores activos no baten a su índice, y que la IA difícilmente cambiará eso para el inversor de a pie.',
  },
  {
    titulo: 'Inteligencia Artificial y los fondos de inversión',
    fuente: 'Universidad Pontificia Comillas · trabajo académico', idioma: 'ES',
    url: 'https://repositorio.comillas.edu/xmlui/handle/11531/78873',
    resumen: '¿Pueden los fondos gestionados por IA batir a los tradicionales? Analiza el caso del ETF AIEQ. Buen marco teórico en español.',
  },
  {
    titulo: 'Pictet AM lanza en Europa ETF de "gestión activa mejorada" con IA',
    fuente: 'RankiaPro (2026)', idioma: 'ES',
    url: 'https://rankiapro.com/es/noticias/pictet-am-lanza-europa-primera-gama-etf-gestion-activa-mejorada-ia/',
    resumen: 'Ejemplo actual de "indexación mejorada" con IA: intenta batir al índice ~1 % al año con poco desvío. Interesante para ver hacia dónde va el sector (y con espíritu crítico).',
  },
];

// Ideas prácticas para usar la IA en una estrategia pasiva (sin caer en la tentación de operar)
export const IDEAS_IA = [
  'Automatiza el control, no las decisiones: que la IA te avise de desviaciones del reparto objetivo, no que te diga cuándo comprar.',
  'Úsala para la parte aburrida: impuestos (FIFO, tramos), traspasos, rebalanceos y comprobar comisiones.',
  'Pídele que te lleve la contraria: antes de vender por miedo, pregúntale qué pasó históricamente tras caídas similares.',
  'Desconfía de cualquier IA que prometa batir al mercado: la evidencia apoya los costes bajos y la constancia.',
];
