declare module "word-extractor" {
  interface WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
  }

  class WordExtractor {
    extract(input: Buffer | string): Promise<WordDocument>;
  }

  export default WordExtractor;
  export { WordExtractor };
}
