<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="400" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

किसी भी गिट रिपॉजिटरी या विज़ुअल स्टाइल रिपॉजिटरी को एलएलएम (बड़े भाषा मॉडल) के प्रशिक्षण डेटासेट में बदलें।

**कोड पाइपलाइन:** यह कोड, कमिट, दस्तावेज़ और परीक्षणों से प्रशिक्षण डेटा निकालती है। यह 6 अलग-अलग प्रारूपों में JSONL फ़ाइलें तैयार करती है, जो फाइन-ट्यूनिंग या प्री-ट्रेनिंग के लिए उपयुक्त हैं।

**दृश्य प्रसंस्करण प्रणाली:** यह प्रणाली, सावधानीपूर्वक तैयार किए गए दृश्य डेटा भंडारों से बहु-आयामी प्रशिक्षण डेटा निकालती है। यह छवियों की जांच करती है, संपत्ति, मानकों और निर्णयों के बीच संबंध सुनिश्चित करती है, और विज़न-भाषा मॉडल को बेहतर बनाने के लिए 10 अलग-अलग प्रारूपों में आउटपुट प्रदान करती है।

## सुरक्षा मॉडल।

`repo-dataset` आपके द्वारा निर्दिष्ट रिपॉजिटरी (repos) से स्रोत फ़ाइलें और गिट इतिहास पढ़ता है। यह आपके द्वारा बताए गए एक फ़ोल्डर में JSONL प्रारूप में आउटपुट लिखता है। यह **कोई भी** नेटवर्क अनुरोध नहीं करता है, कोई टेलीमेट्री डेटा एकत्र नहीं करता है, और लक्षित रिपॉजिटरी और आउटपुट फ़ोल्डर के बाहर की फ़ाइलों तक नहीं पहुंचता है। यह पथ ट्रैवर्सल (path traversal) और सिंबॉलिक लिंक (symlink) हमलों से सुरक्षित है। किसी भी सुरक्षा संबंधी कमजोरी की रिपोर्ट करने के लिए, [SECURITY.md](SECURITY.md) देखें।

## स्थापित करें।

```bash
npm install -g @mcptoolshop/repo-dataset
```

## कोडिंग पाइपलाइन।

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

### कोड आउटपुट के प्रारूप।

| स्वरूप। | उपयोग परिदृश्य। |
|--------|----------|
| `alpaca` | पर्यवेक्षित सूक्ष्म-समायोजन (निर्देश/इनपुट/आउटपुट)। |
| `sharegpt` | बहु-चरणीय वार्तालाप के लिए सूक्ष्म-समायोजन। |
| `openai` | OpenAI संदेशों का प्रारूप। |
| `raw` | निरंतर पूर्व-प्रशिक्षण/आरएजी (RAG) का एकीकरण। |
| `completion` | कच्चे कोड को टेक्स्ट के रूप में उपयोग करना (भाषा मॉडलिंग)। |
| `fim` | मध्य भाग को भरने वाले (स्टारकोडर टोकन)। |

### कोड निष्कर्षण उपकरण।

| निकालने वाला उपकरण। | Source:
स्रोत: | प्रशिक्षण संकेत। |
|-----------|--------|-----------------|
| `code` | स्रोत फ़ाइलें। | इम्पोर्ट संदर्भ के साथ फ़ंक्शन/क्लास निष्कर्षण। |
| `commits` | गिट का इतिहास। | परिवर्तन के स्पष्टीकरण जोड़े बदलें। |
| `docs` | मार्कडाउन फ़ाइलें। | खंड-आधारित अवधारणाओं की व्याख्याएं। |
| `tests` | परीक्षण फ़ाइलें। | कोडिंग और परीक्षण के लिए जोड़े गए उदाहरण। |

## दृश्य प्रसंस्करण प्रणाली।

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

### दृश्य आउटपुट के प्रारूप।

**फ्रेमवर्क-अनुकूल (अनुशंसित):**

| स्वरूप। | ढांचा। | डीपीओ सहायता। |
|--------|-----------|-------------|
| `trl` | हगिंगफेस टीआरएल, अनस्लोथ। | हाँ। |
| `axolotl` | एक्सोलॉटल। | हाँ। |
| `llava` | LLaVA, LLaVA-NeXT. | केवल एसएफटी। |
| `llama_factory` | एलएलएएमए-फैक्टरी। | हाँ। |
| `qwen2vl` | Qwen2-VL, एमएस-स्विफ्ट। | हाँ। |

**सामान्य:**

| स्वरूप। | उपयोग परिदृश्य। |
|--------|----------|
| `visual_universal` | निरीक्षण, डिबगिंग, रूपांतरण। |
| `visual_dpo` | डीपीओ प्राथमिकता जोड़े। |
| `visual_kto` | केटीओ बाइनरी लेबल। |
| `visual_contrastive` | सीएलआईपी-शैली के सकारात्मक/नकारात्मक जोड़े। |
| `visual_pointwise` | प्रत्येक संपत्ति की गुणवत्ता के अंक। |

### दृश्य ध्वज।

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

### डेटा की अखंडता (Data Integrity) या डेटा की सुरक्षा।

प्रत्येक दृश्य प्रशिक्षण सामग्री की "प्रशिक्षण त्रिकोण" के अनुसार जांच की जाती है:

1. **छवि:** मान्य छवि फ़ाइल (पीएनजी/जेपीईजी/वेबपी, आयाम निकाले गए, ट्रंकेशन का पता चला)।
2. **मानक:** शैली नियमों पर आधारित आधिकारिक स्पष्टीकरण।
3. **निर्णय:** स्वीकृत/अस्वीकृत स्थिति, साथ ही प्रत्येक आयाम के लिए स्कोर।

जो इकाइयां जिनमें तीनों आवश्यक घटक नहीं हैं, उन्हें डिफ़ॉल्ट रूप से हटा दिया जाता है। आंशिक इकाइयों को रखने के लिए `--allow-incomplete` विकल्प का उपयोग करें।

## बैकप्रोपगेशन एकीकरण।

"repo-dataset" से प्राप्त परिणाम "[backpropagate](https://github.com/mcp-tool-shop-org/backpropagate)" के साथ संगत हैं, जिनका उपयोग स्थानीय स्तर पर मॉडल को बेहतर बनाने के लिए किया जा सकता है।

### अनुशंसित प्रारूप।

| लक्ष्य। | स्वरूप। | क्यों? |
|------|--------|-----|
| कोड का सूक्ष्म समायोजन। | `chatml` या `alpaca`। | संरचित निर्देशों के जोड़े सीधे तौर पर कोडिंग कार्यों से जुड़े होते हैं। |
| चैट को बेहतर बनाना। | `sharegpt` या `openai`। | बहु-चरणीय बातचीत की संरचना को बनाए रखा गया है। |
| अधूरा निर्माण। | `completion` | असंरचित पाठ, जिसका उपयोग आगे की प्रारंभिक प्रशिक्षण के लिए किया जाएगा। |

"बैकप्रोपगेट" निम्नलिखित प्रारूपों को स्वीकार करता है: `अल्पाका`, `शेयरजीपीटी`, `ओपनएआई`, `चैटएमएल`, और `कंप्लीशन"।

### शुरुआत से अंत तक की कार्यप्रणाली।

```bash
# Generate training data from your repo
repo-dataset generate ./my-project --format chatml --validate

# Fine-tune with backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

### दृश्य डेटासेट।

विज़ुअल पाइपलाइन के आउटपुट (टीआरएल, एक्ज़ोलोटल, एलएलएवीए, आदि) का लक्ष्य विज़न-लैंग्वेज मॉडल को फाइन-ट्यून करना है। बैकप्रोपैगेट अभी तक वीएलएम प्रशिक्षण का समर्थन नहीं करता है - कृपया उनके संबंधित ट्रेनर के साथ सीधे फ्रेमवर्क-देशी प्रारूपों का उपयोग करें।

## आंकड़े

- **संस्करण:** 1.1.0
- **परीक्षण:** 445
- **रनटाइम निर्भरताएँ:** 0
- **नोड:** 20+

## लाइसेंस

एमआईटी

---

<a href="https://mcp-tool-shop.github.io/">एमसीपी टूल शॉप</a> द्वारा निर्मित।
