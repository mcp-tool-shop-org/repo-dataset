<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="500" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

### प्रशिक्षण डेटा बनाने के लिए रिपॉजिटरी का उपयोग करें, इससे पहले कि आप ट्रेनर का उपयोग करें।

repo-dataset कोड, कमिट, दस्तावेज़, परीक्षण और क्यूरेटेड विज़ुअल संपत्तियों को ट्रेनर-तैयार डेटासेट में बदलता है - और फिर गुणवत्ता, अखंडता और संदूषण जोखिम की जांच करता है ताकि आप खराब डेटा पर फाइन-ट्यूनिंग न करें।

repo-dataset स्थानीय मशीन लर्निंग वर्कफ़्लो के लिए डेटासेट निर्माण और सत्यापन परत है। यह ट्रेनर नहीं है। यह किसी प्रारूप रूपांतरण उपकरण का संग्रह भी नहीं है।

## यह क्या है / यह क्या नहीं है

- **यह ट्रेनर नहीं है।** यह JSONL पर ही रुक जाता है। इसे [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate), Axolotl, TRL, LLaMA-Factory, LLaVA, या Qwen2-VL के साथ जोड़ें।
- **यह कोई अन्य प्रारूप रूपांतरण उपकरण नहीं है।** प्रारूपों की विस्तृत श्रृंखला एक बुनियादी आवश्यकता है; इससे ऊपर की परत - संदूषण जांच, गुणवत्ता ग्रेडिंग, अखंडता - ही उत्पाद है।
- **यह स्थानीय मशीन लर्निंग वर्कफ़्लो के लिए एक डेटासेट निर्माण और सत्यापन परत है।** यह प्रशिक्षण से पहले चलता है, और यह उन चीजों को चिह्नित करता है जो फाइन-ट्यूनिंग प्रक्रिया को दूषित कर सकती हैं।
- **यह [style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab) का प्रतिस्पर्धी नहीं है, बल्कि इसका पूरक है।** style-dataset-lab, लेखकित शैली मार्गदर्शिकाओं के लिए एक विशेषीकृत प्रणाली है, जिसमें विज़ुअल डेटासेट भी शामिल हैं; repo-dataset एक व्यापक निर्माण और सत्यापन परत है जिससे कोई भी रिपॉजिटरी - चाहे वह कोड हो या विज़ुअल - गुजर सकती है।

## यह किसके लिए है

- ऐसे एकल मशीन लर्निंग विशेषज्ञ जो अपने स्वयं के कोड पर छोटे मॉडल को प्रशिक्षित कर रहे हैं और यह जानना चाहते हैं कि क्या उनका डेटासेट वास्तव में प्रशिक्षण के लिए उपयुक्त है।
- ऐसी टीमें जो वीएलएम फाइन-ट्यूनिंग के लिए निजी विज़ुअल डेटासेट तैयार कर रही हैं, जिन्हें संपत्ति + कैनन + निर्णय बंधन लागू करने की आवश्यकता है, न कि केवल विश्वास करने की।
- शोधकर्ता जिन्हें डेटासेट या पेपर प्रकाशित करने से पहले संदूषण ऑडिट (लीक हुई जानकारी, व्यक्तिगत जानकारी, बेंचमार्क हस्ताक्षर) की आवश्यकता होती है।

## स्थापना

```bash
npm install -g @mcptoolshop/repo-dataset
```

## संदूषण जांच

यही इसका कारण है। एक बार जब आप एक डेटासेट उत्पन्न कर लेते हैं, तो `validate` आपको बताता है कि क्या यह ट्रेनर को देने के लिए सुरक्षित है।

```bash
repo-dataset validate ./dataset-output/dataset.jsonl
```

आउटपुट इस तरह दिखता है (आकार केवल - वास्तविक संख्याएं आपके कॉर्पस पर निर्भर करती हैं):

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

ग्रेड निर्णय है। एक रिकॉर्ड जो किसी रहस्य, व्यक्तिगत जानकारी या बेंचमार्क हस्ताक्षर को उजागर करता है, उसे प्रति-रिकॉर्ड चिह्नित किया जाता है ताकि आप इसे हटा सकें, संपादित कर सकें, या उस हिस्से को फिर से उत्पन्न कर सकें जिससे वह उत्पन्न हुआ था - इससे पहले कि ट्रेनर उस फ़ाइल को देखे।

## कोड पाइपलाइन

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Control signal balance across extractors
repo-dataset generate ./my-project --format completion --auto-balance
```

### आउटपुट प्रारूप

| प्रारूप | उपयोग का मामला |
|--------|----------|
| `alpaca` | पर्यवेक्षित फाइन-ट्यूनिंग (निर्देश/इनपुट/आउटपुट) |
| `sharegpt` | बहु-चरणीय वार्तालाप फाइन-ट्यूनिंग |
| `openai` | OpenAI संदेश प्रारूप |
| `chatml` | ChatML भूमिका टोकन (Mistral, Hermes, OpenHermes) |
| `raw` | निरंतर प्री-ट्रेनिंग / RAG इंजेक्शन |
| `completion` | पाठ के रूप में कच्चा कोड (भाषा मॉडलिंग) |
| `fim` | फिल-इन-द-मिडिल (StarCoder टोकन) |

### एक्सट्रैक्टर

| एक्सट्रैक्टर | स्रोत | प्रशिक्षण संकेत |
|-----------|--------|-----------------|
| `code` | स्रोत फ़ाइलें | आयात संदर्भ के साथ फ़ंक्शन/क्लास निष्कर्षण |
| `commits` | Git इतिहास | परिवर्तन स्पष्टीकरण जोड़े |
| `docs` | Markdown फ़ाइलें | अनुभाग-आधारित अवधारणा स्पष्टीकरण |
| `tests` | परीक्षण फ़ाइलें | कोड-से-परीक्षण पीढ़ी जोड़े |
| `config` | संरचित फ़ाइलें | Dockerfile, tsconfig, Cargo.toml, CI वर्कफ़्लो, आदि। |

## विज़ुअल पाइपलाइन

विज़ुअल पाइपलाइन कोड पाइपलाइन का पतला आवरण नहीं है। यह **प्रशिक्षण त्रिकोण** को लागू करता है - छवि + कैनन + निर्णय - क्योंकि यह बंधन ही एक उपयोगी वीएलएम डेटासेट को लेबल की गई तस्वीरों के ढेर से अलग करता है।

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

### बंधन अखंडता (त्रिकोण)

प्रत्येक विज़ुअल प्रशिक्षण इकाई की तीन चीजों के लिए जांच की जाती है:

1. **छवि** — मान्य छवि फ़ाइल (PNG/JPEG/WebP, आयाम निकाले गए, ट्रंकेशन का पता चला)।
2. **मानक** — शैली नियमों पर आधारित मानक स्पष्टीकरण।
3. **निर्णय** — स्वीकृत/अस्वीकृत स्थिति, प्रत्येक आयाम के लिए स्कोर के साथ।

डिफ़ॉल्ट रूप से, जिन इकाइयों में कोई भी पैर गायब है, उन्हें हटा दिया जाता है। `--allow-incomplete` आंशिक डेटा को बरकरार रखता है जब आप जानते हैं कि आपको इसकी आवश्यकता क्यों है।

### आउटपुट प्रारूप

**फ़्रेमवर्क-मूल (अनुशंसित):**

| प्रारूप | फ़्रेमवर्क | DPO समर्थन |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | हाँ |
| `axolotl` | Axolotl | हाँ |
| `llava` | LLaVA, LLaVA-NeXT | केवल SFT |
| `llama_factory` | LLaMA-फ़ैक्टरी | हाँ |
| `qwen2vl` | Qwen2-VL, MS-Swift | हाँ |

**सामान्य:**

| प्रारूप | उपयोग का मामला |
|--------|----------|
| `visual_universal` | निरीक्षण, डिबगिंग, रूपांतरण |
| `visual_dpo` | DPO प्राथमिकता जोड़े |
| `visual_kto` | KTO बाइनरी लेबल |
| `visual_contrastive` | CLIP-शैली सकारात्मक/नकारात्मक जोड़े |
| `visual_pointwise` | प्रत्येक संपत्ति के लिए गुणवत्ता स्कोर |

### फ़्लैग

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

## बैकप्रोपैगेशन एकीकरण

`repo-dataset` आउटपुट [बैकप्रोपैगेशन](https://github.com/mcp-tool-shop-org/backpropagate) में प्रवाहित होते हैं, जिससे प्रारूप रूपांतरण चरण के बिना स्थानीय फाइन-ट्यूनिंग की जा सकती है।

| लक्ष्य | प्रारूप | क्यों |
|------|--------|-----|
| कोड फाइन-ट्यूनिंग | `chatml` या `alpaca` | संरचित निर्देश जोड़े सीधे कोड कार्यों से मेल खाते हैं। |
| चैट फाइन-ट्यूनिंग | `sharegpt` या `openai` | बहु-मोड़ वार्तालाप संरचना संरक्षित है। |
| कच्चा समापन | `completion` | निरंतर प्री-ट्रेनिंग के लिए असंरचित पाठ। |

बैकप्रोपैगेशन निम्नलिखित स्वीकार करता है: `alpaca`, `sharegpt`, `openai`, `chatml`, `completion`.

```bash
# Generate, validate, then fine-tune
repo-dataset generate ./my-project --format chatml --validate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

विज़ुअल पाइपलाइन आउटपुट (TRL, Axolotl, LLaVA, आदि) विज़न-लैंग्वेज मॉडल फाइन-ट्यूनिंग को लक्षित करते हैं। बैकप्रोपैगेशन अभी तक VLM प्रशिक्षण का समर्थन नहीं करता है — अपने संबंधित प्रशिक्षकों के साथ फ़्रेमवर्क-मूल स्वरूपों का उपयोग करें।

## सुरक्षा मॉडल

`repo-dataset` आपके द्वारा इंगित किए गए रिपॉजिटरी से स्रोत फ़ाइलें और गिट इतिहास पढ़ता है, और JSONL को आपके द्वारा निर्दिष्ट एक निर्देशिका में लिखता है। यह **कोई** नेटवर्क अनुरोध नहीं करता है, कोई टेलीमेट्री एकत्र नहीं करता है, या लक्ष्य रिपॉजिटरी और आउटपुट निर्देशिका के बाहर की फ़ाइलों तक नहीं पहुंचता है। पथ ट्रैवर्सल और सिम्लिंक हमलों से बचाव किया जाता है। कमजोरियों की रिपोर्टिंग के लिए [SECURITY.md](SECURITY.md) देखें। शिपचेक हार्ड गेट A–D सभी पास होते हैं (देखें [SHIP_GATE.md](SHIP_GATE.md) और [SCORECARD.md](SCORECARD.md))।

## रसीदें

वास्तविक रिपॉजिटरी से वास्तविक डेटासेट, M5 Max रन के साथ (~2026-04-24)। इस अनुभाग में हमारे अपने कोड और विज़ुअल कॉर्पोरा के खिलाफ किए गए डॉगफूड रन से संदूषण का पता लगाने, गुणवत्ता ग्रेड और एंड-टू-एंड फाइन-ट्यून कर्व भरे जाएंगे।

तब तक, प्रमाण परीक्षण सूट और ऊपर दिए गए सत्यापन आउटपुट आकार में है — विपणन दावों में नहीं।

## आंकड़े

- **संस्करण:** 1.2.1
- **परीक्षण:** 91 सूट में से 460 पास
- **रनटाइम निर्भरताएँ:** 0
- **नोड:** 20+
- **पैकेज:** 83 फ़ाइलें / 245 kB

## लाइसेंस

MIT

---

द्वारा निर्मित <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
