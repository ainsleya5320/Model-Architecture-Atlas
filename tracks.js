// ============================================================
// MODEL ATLAS: research tracks, the path, communities
// The three ways to do AI research, a realistic path for a
// self-taught researcher, and where to get feedback.
// ============================================================

const TRACKS = [
  {
    id: "frontier",
    name: "Frontier model research",
    tag: "New architectures and training methods",
    what: "Inventing and testing new architectures, optimizers, training recipes and scaling strategies: the work behind each new generation of models.",
    takes: [
      "Serious math: linear algebra, probability, optimization",
      "Strong PyTorch and distributed-systems engineering",
      "Compute budgets of thousands to millions of GPU-hours",
    ],
    odds: "You can learn to understand this work on your own. Doing it at the frontier as a hobbyist is mostly closed off now: the experiments that matter need lab-scale compute and data.",
    ways: [
      "Small-scale research still counts. The modded-nanoGPT speedrun tests training ideas on GPT-2-sized models in minutes; the Muon optimizer was first demonstrated there before being scaled up by labs.",
      "Reproduce a paper's key result at small scale and publish what does and does not transfer.",
      "Contribute to open training efforts and stacks (EleutherAI, Ai2's OLMo, Hugging Face).",
    ],
    projects: [
      "Reproduce GPT-2 (124M) from scratch with nanoGPT or llm.c on a rented GPU.",
      "Fit your own small scaling law: five model sizes, the same compute budget each.",
      "Swap one component (normalization, optimizer, attention variant) into a speedrun baseline and measure the effect over several seeds.",
    ],
    subs: ["f-linalg", "f-optim", "f-nn", "a-transformer", "a-attention", "a-moe", "a-alt", "d-pretrain", "p-scaling", "p-distributed", "p-recipes"],
    links: ["karpathy-zth", "nanogpt", "llmc", "modded-nanogpt", "cs336", "ultrascale"],
  },
  {
    id: "empirical",
    name: "Empirical research on existing models",
    tag: "Evaluations, interpretability, behavior",
    what: "Studying trained models as objects of science: how they behave, what they represent internally, where they fail, and how to measure all of it.",
    takes: [
      "Python and PyTorch fluency",
      "Statistics and experimental design",
      "A laptop or a cheap cloud GPU: open-weight models are the laboratory",
    ],
    odds: "This is where self-taught people actually publish. It is real science on open-weight models you can run on a laptop or a cheap cloud GPU, and the field is young enough that careful small studies get read.",
    ways: [
      "ARENA's curriculum (free, aimed at alignment and interpretability) and the TransformerLens library are the standard on-ramp.",
      "Mentored programs such as MATS take people from tutorials to first papers.",
      "Replicating published results on newer open models, and reporting what changes, is a real contribution.",
    ],
    projects: [
      "Find and ablate the induction heads in GPT-2 small.",
      "Build a steering vector for one behavior (sycophancy, for example) and measure its effect with error bars.",
      "Measure prompt sensitivity or sycophancy across five open models.",
      "Train a sparse autoencoder on one layer of a small model and label 50 of its features.",
    ],
    subs: ["x-mech", "x-probe", "e-benchmarks", "e-method", "s-failures", "s-alignment", "u-prompting", "f-prob"],
    links: ["arena", "transformerlens", "nanda-start", "neuronpedia", "elhage21", "errorbars24"],
  },
  {
    id: "applied",
    name: "Applied research",
    tag: "A domain question, tested rigorously",
    what: "Picking a question in a domain you know and testing rigorously whether and how models handle it: capability, reliability and failure modes on real tasks.",
    takes: [
      "Deep domain expertise, which is the scarce ingredient",
      "Evaluation methodology and statistics",
      "An API budget of tens to hundreds of dollars",
    ],
    odds: "Your edge here is large: almost nobody running ML evaluations has professional depth in specialized fields. Expertise in your own domain is exactly what most benchmarks lack, so a small, careful study can say something nobody else can.",
    ways: [
      "Write a small benchmark graded by experts and analyze how models fail, not just how often.",
      "Compare grounding strategies (no retrieval, RAG, long context) on documents you know well.",
      "Test agent reliability on a realistic multi-step workflow from your field.",
    ],
    projects: [
      "A 50-question expert benchmark with answer keys, grading rubrics and a failure taxonomy.",
      "A prompt-sensitivity study: the same questions in three framings, across several models.",
      "RAG versus no-RAG accuracy on a document collection you know well.",
    ],
    subs: ["e-method", "e-benchmarks", "u-prompting", "u-rag", "u-agents", "s-failures", "r-experiments"],
    links: ["errorbars24", "judge23", "sclar23", "lm-eval", "inspect", "karpathy-recipe"],
  },
];

// The realistic path for someone who has already done 3Blue1Brown, Karpathy and Raschka.
const PATH = [
  {
    id: "p0", title: "Foundations", defaultDone: true,
    what: "3Blue1Brown's neural-network series, Karpathy's Zero to Hero lectures and Raschka's build-an-LLM book: the conceptual base. You have already done this.",
    doneWhen: "You can explain backpropagation, attention and the training pipeline in your own words.",
    links: [["#subfields/f-optim", "Backprop & optimization"], ["#subfields/a-transformer", "The transformer block"]],
  },
  {
    id: "p1", title: "Finish one implementation end to end",
    what: "Do Karpathy's 'build GPT from scratch' yourself, typing every line, without watching along. Understanding a transformer and building one are different muscles.",
    doneWhen: "Your own GPT trains on a corpus and generates text, and you can explain every line without notes.",
    links: [["#subfields/a-transformer", "The transformer block"], ["#subfields/a-token", "Tokenization"]],
  },
  {
    id: "p2", title: "Learn to read papers",
    what: "One paper per week, with notes on what was claimed, how it was tested, and what would falsify it. A 10-K forensics habit transfers almost one-to-one.",
    doneWhen: "Eight papers logged with claim, test and falsifier in the Reading list journal.",
    links: [["#reading", "Reading list & journal"], ["#subfields/r-papers", "Reading papers"]],
  },
  {
    id: "p3", title: "Run a small original experiment",
    what: "Pick a narrow question, test several open models, and analyze how they fail, not just how often. Write it up properly: that write-up is already AI research, just small.",
    doneWhen: "A public write-up with code, data and error bars.",
    links: [["#subfields/r-experiments", "Running experiments"], ["#subfields/e-method", "Eval methodology"]],
  },
  {
    id: "p4", title: "Get feedback early",
    what: "Teaching yourself works for skills, but research also needs people who will tell you that your result is an artifact of your prompt formatting. Join a community before your first experiment, not after it.",
    doneWhen: "Someone experienced has critiqued your method, and you changed something because of it.",
    links: [["#tracks/communities", "Communities"]],
  },
];

const COMMUNITIES = [
  { name: "EleutherAI", url: "https://www.eleuther.ai/", for: "Open research on models, evaluation and interpretability; an active Discord where papers and methods get discussed." },
  { name: "LessWrong & the Alignment Forum", url: "https://www.alignmentforum.org/", for: "Long-form research posts that draw sharp methodological critique, especially on safety and interpretability." },
  { name: "ARENA", url: "https://www.arena.education/", for: "Free alignment and interpretability curriculum, plus in-person bootcamps." },
  { name: "MATS", url: "https://www.matsprogram.org/", for: "Mentored research program in alignment, interpretability and governance." },
  { name: "BlueDot Impact", url: "https://bluedot.org/", for: "Free cohort-based courses on AI safety and AI governance." },
  { name: "GPU MODE", url: "https://www.gpumode.com/", for: "Lectures and a Discord on GPU programming, kernels and performance." },
  { name: "r/LocalLLaMA", url: "https://www.reddit.com/r/LocalLLaMA/", for: "Practical know-how on running, quantizing and fine-tuning open models." },
  { name: "Hugging Face", url: "https://huggingface.co/", for: "Models, datasets and daily papers, with forums and a Discord around them." },
];
