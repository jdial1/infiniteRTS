import sys

def main():
    with open('src/App.tsx', 'r') as f:
        content = f.read()

    # Move isPointInTerritory out of the Build Mode check and into the loop function's scope
    # So it can be used by both the validation and the drawTerritory function if needed.
    # Actually, let's put it at the start of the 'loop' function.

    # 1. Remove the incorrectly placed isPointInTerritory
    start_tag = "const isPointInTerritory = (px: number, py: number, userId: string): boolean => {"
    end_tag = "return false;\n        };"

    start_idx = content.find(start_tag)
    end_idx = content.find(end_tag) + len(end_tag)

    if start_idx != -1 and end_idx != -1:
        is_point_code = content[start_idx:end_idx]
        content = content[:start_idx] + content[end_idx:]
    else:
        print("Could not find isPointInTerritory to move")
        sys.exit(1)

    # 2. Inject it at the beginning of the loop function
    loop_start = content.find("const loop = (time: number) => {")
    if loop_start == -1:
         print("Could not find loop start")
         sys.exit(1)

    loop_body_start = content.find("{", loop_start) + 1
    content = content[:loop_body_start] + "\n        " + is_point_code + "\n" + content[loop_body_start:]

    with open('src/App.tsx', 'w') as f:
        f.write(content)
    print("Successfully moved isPointInTerritory to loop scope")

if __name__ == "__main__":
    main()
