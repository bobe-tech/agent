// A markdown document exposed by the API (strategy / reflection prompts), rendered read-only on the docs page.
export type DocName = 'strategy' | 'reflection';

export interface Doc {
  name: DocName;
  content: string;
}
