# syuttensien-app

訪問看護ステーションの出店支援アプリ。指定した地点の半径10km以内について、以下の情報をマップ上に表示する。

- 年齢別人口
- 地域区分
- 訪問看護ステーション（訪看ST）数
- 医療機関数
- 訪問診療を行う事業所数
- ケアマネジャー事業所数
- （地域包括支援センター等の）相談員事業所数

## 技術スタック

- HTML5 / CSS3 / JavaScript (Vanilla JS)
- 地図表示: Leaflet + 国土地理院（GSI）タイル（淡色地図/航空写真/地名ラベル、レイヤー切り替え可）（CDN 経由、無料・APIキー不要）
- 住所検索（ジオコーディング）: Nominatim（OpenStreetMap、無料・レート制限に注意）
- 年齢別人口: e-Stat API（令和2年国勢調査 1kmメッシュ統計）。`mesh.js`で検索地点から半径10km圏内の3次メッシュコードを算出し、`population.js`で年齢区分別人口を集計して表示。e-StatのappIdは`config.js`（.gitignore対象）で管理し、`config.example.js`をテンプレートとする
- 地域区分（介護報酬の級地）: 厚生労働大臣が定める一単位の単価（告示）別表に基づく市町村別データを`chiiki-kubun.js`に整備。Nominatim逆ジオコーディングで市区町村を判定して表示
- 訪問看護ステーション数: 厚生労働省「介護サービスの情報公表システム オープンデータ」（サービス種別コード130、緯度経度付き、CC BY、年2回＝6月末・12月末時点で更新）を`houkan-st-data.js`に格納し、`facilities.js`で半径10km圏内の件数を集計。`scripts/update-kaigo-opendata.js`で自動更新（下記「データの自動更新」参照）
- 入院施設のある病院数（総合病院／精神科病院）: 国土数値情報「医療機関データ」（P04、令和2年度、国土交通省）から病院(P04_001=1)を抽出。診療科目が精神科関連語のみで構成されるものを精神科病院、それ以外（精神科を含む総合病院等も含む）を総合病院として分類。`hospitals-data.js`に格納。国土数値情報の更新は数年に1度と不定期なため自動更新の対象外（手動更新）
- 訪問診療を行う事業所数: JMAP（日本医師会 地域医療情報システム、https://jmap.jp/）の施設別検索から、在宅療養支援診療所・病院の全6区分（診療所/病院 × 単独型機能強化型・連携型機能強化型・従来型）を47都道府県分取得。**機能強化型・従来型が混在**（区分自体はデータの4列目に保持しているので、将来「機能強化型のみ」に絞ることも可能）。住所→緯度経度はNominatimでジオコーディング（同姓同名の別施設を誤って使い回さないよう都道府県範囲チェックあり）。計15,636件（2026年8月時点）。`home-visit-clinic-data.js`に格納。`scripts/update-home-visit-clinic.js`で自動更新
- ケアマネジャー（居宅介護支援事業所）数: 厚生労働省「介護サービスの情報公表システム オープンデータ」（サービス種別コード430、緯度経度付き、CC BY、年2回更新）を`caremanager-office-data.js`に格納。`scripts/update-kaigo-opendata.js`で自動更新
- 地域包括支援センター数: 国土数値情報「福祉施設データ」（P14、令和3年度、国土交通省）から福祉施設小分類コード991303（地域包括支援センター）のみを抽出（991301・991306は障害福祉の相談支援事業所のため除外）。`comprehensive-support-center-data.js`に格納
- 相談支援事業所数: 国土数値情報「福祉施設データ」（P14）から施設名に「相談支援」を含む施設を抽出（自治体によりコード付けが不統一なため名称で判定）
- 基幹相談支援センター数: 厚生労働省公式「基幹相談支援センター一覧」（令和7年4月1日時点、市町村別、約1,049件）。P14データの名称検索（136件）では実態より大幅に少なかったため公式名簿に切り替え。緯度経度が無いため住所から市区町村を抽出しNominatimでジオコーディング。相談支援事業所・基幹相談支援センターともに`consultation-office-data.js`に格納
- ビルドツール不使用

## データの自動更新

毎月1日（GitHub Actions、`.github/workflows/monthly-data-update.yml`）に以下を自動実行し、変化があればコミット・プッシュする。

- `scripts/update-kaigo-opendata.js`: 訪看ST・ケアマネのCSVを再取得
- `scripts/update-home-visit-clinic.js`: JMAPから訪問診療の全件を再取得し、新しく見つかった施設だけNominatimで位置情報を調べる（既存施設は前回の位置情報を名前一致で使い回す）

ローカルで手動実行する場合:

```bash
npm install
npx playwright install chromium
node scripts/update-kaigo-opendata.js
node scripts/update-home-visit-clinic.js
```

`update-home-visit-clinic.js`は初回（またはJMAP側の掲載形式が大きく変わった場合）は全件を新規にジオコーディングするため数時間かかることがある。`.jmap-progress.json`（JMAP取得の進捗）・`.jmap-geocode-progress.json`（位置情報取得の進捗）に途中経過を保存するため、処理が止まっても再実行すれば続きから再開できる。

反映後、GAS版（`app.html`・`index.html`・`stylesheet.html`）にも同じ内容をコピーし、`clasp push`＋デプロイの更新が必要（GitHub側のデータファイルはjsDelivr CDN経由でGAS版からも参照されるため、データファイル自体はGAS側に手動反映しなくても翌日程度で自動的に反映されるが、即時反映したい場合はjsDelivrのキャッシュパージが必要）。

## コーディング規約

- インデントはスペース 2 つ
- セミコロンあり
- `const` / `let` を使用し `var` は禁止
- コメントは WHY が自明でない箇所のみ（日本語可）

## Git 運用ルール

### 基本方針

**コードを変更するたびに、必ず GitHub へプッシュすること。**

ローカルコミットのみで作業を終わらせない。変更 → コミット → プッシュを1セットとする。

### プッシュ先

https://github.com/yhiguchi-collab/syuttensien-app.git （main ブランチ）

### 手順

1. 変更をステージング
   ```bash
   git add <変更ファイル>
   ```
2. コミット（日本語で変更内容を簡潔に記述）
   ```bash
   git commit -m "変更内容の説明"
   ```
3. GitHub へプッシュ
   ```bash
   git push origin main
   ```

### コミットメッセージ規約

- 日本語で記述してよい
- 変更の「何を」「なぜ」が伝わる内容にする
- 例: `半径10km検索のロジックを追加`、`バグ修正: 訪看ST数の集計が重複していた問題`

### 注意事項

- センシティブな情報（APIキー、パスワード等、特に地図APIや人口統計APIのキー）は絶対にコミットしない
- `.gitignore` に不要ファイルを登録してからコミットする
- `node_modules/` や OS 生成ファイル（`desktop.ini` 等）はコミットしない

## 動作確認

```bash
# Python が使える場合
python -m http.server 8080

# Node.js が使える場合
npx serve .
```
