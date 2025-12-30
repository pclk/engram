# engram

> An engram is a unit of cognitive information imprinted in a physical substance, theorized to be the means by which memories are stored.

Engram is a web-based text editor that is suited for studying, and the eventual translation into Anki flashcards. Power users often rely on local workflows (Obsidian, Neovim, Anki Desktop) to study effectively. However, when restricted to public computers or web-only environments, this workflow breaks. Existing web tools lack the speed of modal editing and the specific structure needed for creating high-quality flashcards.

It has a focus on vim style modal editing, and it replicates the workflow I had on my macbook. I currently face a limitation to only access the web for studying, and I cannot use mac/linux terminals like my previous workflow.
It runs entirely in the browser and uses your Google Drive as the storage component.
- Topics: The notebook level (e.g., "Bluetooth Protocol").
- Concepts: Atomic blocks of thought. Instead of writing a wall of text, you write about a specific mechanism (e.g., "Frequency Hopping").
  - AI Integration: Feynman Technique: Asks you to explain the most complicated part of your concept.
- Derivatives: Expand on concepts with:
  - Probing Questions: Your questions that challenge your logic ("Why hop frequencies? Why not just use one band?").
    - AI Integration:  Answers your question.
  - Cloze Deletions: The final step to memorize the concept.
    - AI Integration: Offers critique.

Each “concept” can be attached with various derivatives. These derivatives include “Probing questions”, “Cloze”, 

“Probing questions” represents questions that probe your understanding further. It aims to instil curiosity, engagement and innovation on the concept, things that make you think “hey yeah, this doesn’t really make sense from this perspective, why not do this instead?” For example in the bluetooth scenario, someone may ask “Why does bluetooth even need to hop around frequencies when they can just use a band? Wouldn’t it be much easier?” Frequently, these sorts of questions allow us to fill in gaps in our logic, and bring much more engagement into the material.

“Cloze” represents the final translation into an Anki Flashcard. Once understanding was built, the user likely wants to remember this information through a self-created cloze.

Each of these “concept” and “derivatives” are able to be replied to AI with a single click. For example, the AI will reply to “Probing questions” in a manner that answers the question. The AI will provide criticisms for “concept” and “Cloze”.

The final process is Ankify. Upon pressing this button, all the concepts with Cloze become selectable, and all that have not been selected before, become selected by default. Cloze cards will be created, with the “concept” as additional info. A QR code will be provided with a link, then the user can scan it in order to download the .apkg file into Anki and start reviewing.


### ⌨️ Key Bindings

| Key | Mode | Action | Context / Notes |
| :--- | :--- | :--- | :--- |
| **Navigation** | | | |
| `j` / `k` | Normal | Move focus **Down / Up** | Navigates between Concepts or Derivatives |
| `h` | Normal | **Jump Out** (Parent Level) | Returns focus from Derivative → Concept |
| `l` | Normal | **Dive In** (Child Level) | Focuses from Concept → Derivative (e.g., questions) |
| **Editing** | | | |
| `i` | Normal | Enter **Insert Mode** | Cursor at beginning of block |
| `a` | Normal | Enter **Insert Mode** | Cursor at end of block |
| `Esc` | Insert | **Exit** to Normal Mode | Stops text editing |
| `Emacs Bindings`| Insert | Text Navigation | Standard Emacs keys (Ctrl-A, Ctrl-E) active while typing |
| **Structure** | | | |
| `o` | Normal | Insert Block **Below** | Creates Concept or Derivative depending on current level |
| `O` | Normal | Insert Block **Above** | Creates Concept or Derivative depending on current level |
| `dd` | Normal | **Delete** Block | Removes the selected Concept or Derivative |
| **Workflow & AI** | | | |
| `ga` | Normal | **AI Integration** | Activates AI response for the selected block |
| `gk` | Normal | **Ankify Mode** | Activates selection mode to export cards |
| `s` | Normal | **Save** | Pushes changes to Drive immediately |
| `Ctrl` + `s` | Insert | **Save & Exit** | Saves to Drive and returns to Normal Mode |
