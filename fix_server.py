import sys

def main():
    with open('server.ts', 'r') as f:
        lines = f.readlines()

    # We need to find where startServer starts and where generateChunk is nested
    # Then move generateChunk and any other nested top-level-like functions out.

    # Simple approach: delete the current startServer definition and rewrite it cleanly.
    # But that's risky. Let's find the closing brace of startServer.

    # Based on the grep, startServer starts at line 90.
    # Based on the grep, the last line is 863.

    content = "".join(lines)

    # Find startServer start
    ss_start = content.find("async function startServer() {")
    if ss_start == -1:
        print("Could not find startServer")
        sys.exit(1)

    # Find the io definition
    io_def = """  const io = new Server(httpServer, {
    cors: { origin: '*' } // Be permissive for dev
  });"""

    io_pos = content.find(io_def)
    if io_pos == -1:
        print("Could not find io definition")
        sys.exit(1)

    # Find generateChunk
    gc_start = content.find("function generateChunk(cx: number, cy: number) {")
    if gc_start == -1:
        print("Could not find generateChunk")
        sys.exit(1)

    # We want to move generateChunk out. But it needs 'io'.
    # So we should pass 'io' to it or make 'io' a global let.

    # Let's make io a global let.

    new_header = """// Global io instance
let io: Server;

function isPointInTerritory"""

    content = content.replace("function isPointInTerritory", new_header)
    content = content.replace("const io = new Server", "io = new Server")

    # Now find generateChunk and move it before startServer
    # First extract generateChunk. We need to find its end.
    # It starts at gc_start.
    # Let's find the next "async function" or "io.on('connection'" or something.

    # Actually, it's easier to just move the closing brace of startServer up if it was accidentally moved down.
    # But the code review said I wrapped it.

    # Let's look at the file content around generateChunk again.

    sys.exit(0)

if __name__ == "__main__":
    main()
