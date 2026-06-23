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
- ビルドツール不使用

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
