<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="400" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

Convierta cualquier repositorio de Git o repositorio de estilos visuales en conjuntos de datos de entrenamiento para modelos de lenguaje grandes (LLM).

**Canal de código:** Extrae señales de entrenamiento del código, commits, documentación y pruebas. Genera archivos JSONL en 6 formatos listos para el ajuste fino o el pre-entrenamiento.

**Canal visual:** Extrae datos de entrenamiento multimodales de repositorios visuales curados. Valida imágenes, aplica restricciones de asociación de activos y juicios, y genera archivos en 10 formatos nativos de frameworks para el ajuste fino de modelos de lenguaje y visión.

## Modelo de seguridad

repo-dataset lee archivos de origen y el historial de Git de los repositorios a los que se le indica. Escribe la salida en formato JSONL en un directorio que usted especifica. **No** realiza solicitudes de red, recopila datos de telemetría ni accede a archivos fuera del repositorio de destino y el directorio de salida. Se protegen contra ataques de recorrido de rutas y enlaces simbólicos. Consulte [SECURITY.md](SECURITY.md) para informar sobre vulnerabilidades.

## Instalación

```bash
npm install -g @mcptoolshop/repo-dataset
```

## Canal de código

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Quality report on generated data
repo-dataset validate ./dataset-output/dataset.jsonl

# Control signal balance
repo-dataset generate ./my-project --format completion --auto-balance
```

### Formatos de salida de código

| Formato | Caso de uso |
|--------|----------|
| `alpaca` | Ajuste fino supervisado (instrucción/entrada/salida) |
| `sharegpt` | Ajuste fino de conversaciones multi-turno |
| `openai` | Formato de mensajes de OpenAI |
| `raw` | Pre-entrenamiento continuo / Ingestión RAG |
| `completion` | Código sin procesar como texto (modelado de lenguaje) |
| `fim` | Completar el espacio en blanco (tokens de StarCoder) |

### Extractores de código

| Extractor | Fuente | Señal de entrenamiento |
|-----------|--------|-----------------|
| `code` | Archivos de origen | Extracción de funciones/clases con contexto de importación |
| `commits` | Historial de Git | Pares de explicación de cambios |
| `docs` | Archivos Markdown | Explicaciones de conceptos basados en secciones |
| `tests` | Archivos de prueba | Pares de generación de código a prueba |

## Canal visual

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

### Formatos de salida visual

**Nativos del framework (recomendado):**

| Formato | Framework | Soporte DPO |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Sí |
| `axolotl` | Axolotl | Sí |
| `llava` | LLaVA, LLaVA-NeXT | Solo ajuste fino (SFT) |
| `llama_factory` | LLaMA-Factory | Sí |
| `qwen2vl` | Qwen2-VL, MS-Swift | Sí |

**Genéricos:**

| Formato | Caso de uso |
|--------|----------|
| `visual_universal` | Inspección, depuración, conversión |
| `visual_dpo` | Pares de preferencias DPO |
| `visual_kto` | Etiquetas binarias KTO |
| `visual_contrastive` | Pares positivos/negativos al estilo de CLIP |
| `visual_pointwise` | Puntuaciones de calidad por activo |

### Indicadores visuales

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

### Integridad de la asociación

Cada unidad de entrenamiento visual se verifica para el **triángulo de entrenamiento**:

1. **Imagen** — archivo de imagen válido (PNG/JPEG/WebP, dimensiones extraídas, detección de truncamiento)
2. **Canon** — explicación canónica basada en reglas de estilo
3. **Juicio** — estado aprobado/rechazado con puntuaciones por dimensión

Las unidades que no tienen las tres partes se descartan de forma predeterminada. Use `--allow-incomplete` para mantener las unidades parciales.

## Integración de retropropagación

Las salidas de repo-dataset son compatibles con [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) para el ajuste fino local.

### Formatos recomendados

| Objetivo | Formato | Por qué |
|------|--------|-----|
| Ajuste fino de código | `chatml` o `alpaca` | Los pares de instrucciones estructurados se mapean directamente a tareas de código |
| Ajuste fino de chat | `sharegpt` o `openai` | Estructura de conversación multi-turno preservada |
| Completar sin procesar | `completion` | Texto no estructurado para el pre-entrenamiento continuo |

Backpropagate acepta: `alpaca`, `sharegpt`, `openai`, `chatml` y `completion`.

### Flujo de trabajo de extremo a extremo

```bash
# Generate training data from your repo
repo-dataset generate ./my-project --format chatml --validate

# Fine-tune with backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

### Conjuntos de datos visuales

Las salidas de la canalización visual (TRL, Axolotl, LLaVA, etc.) están diseñadas para el ajuste fino de modelos de visión y lenguaje. Backpropagate aún no admite el entrenamiento de modelos de visión y lenguaje; utilice directamente los formatos nativos del framework con sus respectivos entrenadores.

## Estadísticas

- **Versión:** 1.1.0
- **Pruebas:** 445
- **Dependencias de tiempo de ejecución:** 0
- **Node:** 20+

## Licencia

MIT

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
