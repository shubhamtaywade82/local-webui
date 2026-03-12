# Thinking Mode: Test Prompts

Use these prompts with **Thinking Mode** toggled **ON** in the sidebar. These are designed to trigger step-by-step reasoning that you can view in the "Thinking Process" block.

---

## 1. Logic & Riddles
These require the model to build a mental model of a situation.

- **The Boat Puzzle**: "A farmer needs to cross a river with a wolf, a goat, and a cabbage. The boat can only hold the farmer and one other item. If left alone, the wolf eats the goat, or the goat eats the cabbage. How does he cross?"
- **Relative Age**: "When I was 6, my sister was half my age. Now I am 70. How old is my sister?"
- **The Heavy Coin**: "I have 9 coins. One is slightly heavier than the rest. Using a balance scale only twice, how can I find the heavy coin?"

## 2. Mathematical Reasoning
Forces the model to show its calculations.

- **Word Problem**: "If a train travels at 60 mph for 45 minutes, then stops for 15 minutes, then travels at 80 mph for another 30 minutes, what is its average speed for the entire journey?"
- **Percentage Play**: "A shirt is originally $80. It's on sale for 25% off. After the discount, a 10% sales tax is added. What is the final price?"

## 3. Coding & Architecture
Best for seeing technical trade-offs.

- **Refactoring Strategy**: "I have a legacy monolithic Express app. I want to move to a microservices architecture using Docker. List the steps I should take and analyze the risks of each step."
- **Algorithm Choice**: "Should I use a Hash Map or a Binary Search Tree if I need to perform frequent lookups but also occasionally need to print all elements in sorted order? Explain your reasoning."

## 4. RAG-Specific (Local Knowledge)
Tests the combination of files + reasoning.

- **Privacy Audit**: "Based on the files in my knowledge base, are there any potential security risks or exposed credentials? Reason through each file listed in the index."
- **Project Timeline**: "Combine the information from `trivia.md` and any other project files to create a consolidated timeline of all upcoming milestones."
