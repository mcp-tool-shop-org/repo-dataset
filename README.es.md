<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="500" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

### Cree conjuntos de datos de entrenamiento a partir de repositorios antes de utilizar el programa de entrenamiento

repo-dataset convierte código, commits, documentación, pruebas y recursos visuales curados en conjuntos de datos listos para el entrenamiento, y luego verifica la calidad, la integridad de los enlaces y el riesgo de contaminación para que no ajuste los modelos con datos incorrectos.

repo-dataset es la capa de construcción y verificación de conjuntos de datos para flujos de trabajo de aprendizaje automático locales. No es un programa de entrenamiento. No es una colección de formatos.

## ¿Qué es / qué no es?

- **No es un programa de entrenamiento.** Se detiene en el formato JSONL. Utilícelo junto con [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate), Axolotl, TRL, LLaMA-Factory, LLaVA o Qwen2-VL.
- **No es otro convertidor de formatos.** La compatibilidad con diferentes formatos es fundamental; lo que hay por encima de eso (verificación de contaminación, clasificación de calidad, integridad de los enlaces) es lo que realmente importa.
- **Es una capa de construcción y verificación de conjuntos de datos** para flujos de trabajo de aprendizaje automático locales. Se ejecuta antes del entrenamiento y señala qué elementos podrían corromper un proceso de ajuste fino.
- **Es un complemento, no un competidor de [style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab).** style-dataset-lab es el sistema especializado de conjuntos de datos visuales y "canones" para guías de estilo; repo-dataset es la capa más amplia de construcción y verificación que cualquier repositorio, ya sea de código o visual, puede utilizar.

## Para quién es esto

- Para profesionales de aprendizaje automático que entrenan modelos pequeños con su propio código y quieren saber si su conjunto de datos es realmente adecuado para el entrenamiento.
- Para equipos que curan conjuntos de datos visuales privados para el ajuste fino de modelos de lenguaje visual (VLM) y necesitan garantizar la coherencia de los recursos, los "canones" y las valoraciones, en lugar de simplemente confiar en ellos.
- Para investigadores que necesitan auditorías de contaminación (secretos filtrados, información de identificación personal, firmas de referencia) antes de publicar un conjunto de datos o un artículo.

## Instalación

```bash
npm install -g @mcptoolshop/repo-dataset
```

## La verificación de contaminación

Esta herramienta existe por esta razón. Después de generar un conjunto de datos, la función `validate` le indica si es seguro utilizarlo para entrenar un modelo.

```bash
repo-dataset validate ./dataset-output/dataset.jsonl
```

La estructura de la salida es la siguiente (las dimensiones solo son indicativas; los números reales dependen de su corpus):

```
Dataset Quality Report
  Records:          <count>
  Duplicate rate:   <percent>   (MinHash LSH, 64 hashes / 8 bands / 0.8 threshold)
  Token budget:     <p50 / p95 / max>

Contamination
  Leaked secrets:   <count>     (API keys, tokens, private key headers)
  PII patterns:     <count>     (emails, phone numbers, SSN-shaped strings)
  Benchmark leaks:  <count>     (HumanEval signature matches)

Grade: <A | B | C | D | F>
```

La calificación es el veredicto. Si un registro contiene un secreto, información de identificación personal o una firma de referencia, se marca por registro para que pueda eliminarlo, censurarlo o regenerar la parte que lo generó, antes de que el programa de entrenamiento acceda al archivo.

## Flujo de trabajo de código

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Control signal balance across extractors
repo-dataset generate ./my-project --format completion --auto-balance
```

### Formatos de salida

| Formato | Caso de uso |
|--------|----------|
| `alpaca` | Ajuste fino supervisado (instrucción/entrada/salida) |
| `sharegpt` | Ajuste fino de conversaciones con múltiples turnos |
| `openai` | Formato de mensajes de OpenAI |
| `chatml` | Tokens de rol de ChatML (Mistral, Hermes, OpenHermes) |
| `raw` | Pre-entrenamiento continuo / Ingestión para sistemas de recuperación aumentada de información (RAG) |
| `completion` | Código sin procesar como texto (modelado del lenguaje) |
| `fim` | Completar el hueco (tokens de StarCoder) |

### Extractores

| Extractor | Fuente | Señal de entrenamiento |
|-----------|--------|-----------------|
| `code` | Archivos de origen | Extracción de funciones/clases con contexto de importación |
| `commits` | Historial de Git | Pares de explicación de cambios |
| `docs` | Archivos Markdown | Explicaciones de conceptos basados en secciones |
| `tests` | Archivos de prueba | Pares de generación de código a prueba |
| `config` | Archivos estructurados | Dockerfile, tsconfig, Cargo.toml, flujos de trabajo de CI, etc. |

## Flujo de trabajo visual

El flujo de trabajo visual no es simplemente una capa superficial sobre el flujo de trabajo de código. Hace cumplir el **triángulo de entrenamiento** (imagen + "canon" + valoración), porque esa coherencia es lo que diferencia un conjunto de datos VLM utilizable de una colección de imágenes etiquetadas.

```bash
# Generate training data from a visual style repo
repo-dataset visual generate ./my-style-repo --format trl

# With base64-embedded images (self-contained JSONL)
repo-dataset visual generate ./my-style-repo --format trl --embed

# Preview visual extraction
repo-dataset visual inspect ./my-style-repo

# Corpus health report
repo-dataset visual validate ./exports/dataset.jsonl
```

### Integridad de los enlaces (el triángulo)

Cada unidad de entrenamiento visual se verifica para tres cosas:

1. **Imagen** — archivo de imagen válido (PNG/JPEG/WebP, dimensiones extraídas, se detectó truncamiento).
2. **Canónico** — explicación canónica basada en reglas de estilo.
3. **Evaluación** — estado de aprobación/rechazo con puntuaciones por dimensión.

Por defecto, las unidades que carecen de alguna parte se eliminan. La opción `--allow-incomplete` conserva las unidades parciales cuando sabes por qué las necesitas.

### Formatos de salida

**Nativo del framework (recomendado):**

| Formato | Framework | Soporte para DPO |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Sí |
| `axolotl` | Axolotl | Sí |
| `llava` | LLaVA, LLaVA-NeXT | Solo SFT |
| `llama_factory` | LLaMA-Factory | Sí |
| `qwen2vl` | Qwen2-VL, MS-Swift | Sí |

**Genérico:**

| Formato | Caso de uso |
|--------|----------|
| `visual_universal` | Inspección, depuración, conversión |
| `visual_dpo` | Pares de preferencias de DPO |
| `visual_kto` | Etiquetas binarias de KTO |
| `visual_contrastive` | Pares positivos/negativos al estilo CLIP |
| `visual_pointwise` | Puntuaciones de calidad por activo |

### Banderas

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

## Integración de retropropagación

Las salidas de repo-dataset se dirigen a [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) para el ajuste fino local sin un paso de conversión de formato.

| Objetivo | Formato | ¿Por qué? |
|------|--------|-----|
| Ajuste fino de código | `chatml` o `alpaca` | Los pares de instrucciones estructuradas se mapean directamente a tareas de código. |
| Ajuste fino de conversación | `sharegpt` o `openai` | Se preserva la estructura de conversación de varios turnos. |
| Completado sin formato | `completion` | Texto no estructurado para el preentrenamiento continuo. |

Backpropagate acepta: `alpaca`, `sharegpt`, `openai`, `chatml`, `completion`.

```bash
# Generate, validate, then fine-tune
repo-dataset generate ./my-project --format chatml --validate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

Las salidas de la canalización visual (TRL, Axolotl, LLaVA, etc.) están diseñadas para el ajuste fino de modelos de lenguaje y visión. Backpropagate aún no admite el entrenamiento de modelos de lenguaje y visión; utilice los formatos nativos del framework con sus respectivos entrenadores.

## Modelo de seguridad

repo-dataset lee archivos de origen e historial de Git de los repositorios a los que se le indica, y escribe JSONL en un directorio que especifique. **No** realiza solicitudes de red, recopila datos de telemetría ni accede a archivos fuera del repositorio de origen y el directorio de salida. Se protegen contra ataques de recorrido de rutas y enlaces simbólicos. Consulte [SECURITY.md](SECURITY.md) para informar de vulnerabilidades. Las pruebas de seguridad (Shipcheck) pasan todas las fases A–D (consulte [SHIP_GATE.md](SHIP_GATE.md) y [SCORECARD.md](SCORECARD.md)).

## Recibos

Conjuntos de datos reales de repositorios reales, con ejecuciones M5 Max (aproximadamente 24 de abril de 2026). Esta sección se completará con detecciones de contaminación, calificaciones de calidad y curvas de ajuste fino de extremo a extremo de ejecuciones internas contra nuestro propio código y corpus visuales.

Por ahora, la prueba está en el conjunto de pruebas y la forma de salida del validador que se muestra arriba, no en las afirmaciones de marketing.

## Estadísticas

- **Versión:** 1.2.0
- **Pruebas:** 460 superadas en 91 suites
- **Dependencias de tiempo de ejecución:** 0
- **Nodo:** 20+
- **Paquete:** 83 archivos / 245 kB

## Licencia

MIT

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
