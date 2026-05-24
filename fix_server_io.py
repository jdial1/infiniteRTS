import sys

def main():
    with open('server.ts', 'r') as f:
        lines = f.readlines()

    # Move io definition to global scope and fix generateChunk nesting
    content = "".join(lines)

    # 1. Add io to global scope
    if "let io: Server;" not in content:
        content = content.replace("import { Server } from 'socket.io';", "import { Server } from 'socket.io';\n\nlet io: Server;")

    # 2. Fix io assignment in startServer
    content = content.replace("  const io = new Server(", "  io = new Server(")

    # 3. Find generateChunk and ensure it's not nested in startServer
    # It seems it was already mostly top-level but maybe the brace was wrong.
    # Looking at the previous sed output, generateChunk was after startServer's io definition.

    # Let's find the closing brace of startServer and see if it's at the end.
    # The startServer function should end after the httpServer.listen call.

    # Actually, let's just make sure generateChunk is moved before startServer.
    gc_start = content.find("function generateChunk(cx: number, cy: number) {")
    if gc_start != -1:
        # Find the end of generateChunk (heuristic: next "async function" or end of file if it was at end)
        # But wait, it's easier to just find the whole block.

        # Let's look for the start of startServer
        ss_start = content.find("async function startServer() {")

        if gc_start > ss_start:
             # It is nested or after.
             # Let's find the connection handler which is definitely inside startServer
             conn_handler = "io.on('connection'"
             conn_pos = content.find(conn_handler)

             if gc_start < conn_pos:
                  # It's nested between io def and connection handler!
                  # We need to extract it.

                  # Find end of generateChunk block (this is tricky without a real parser)
                  # It ends before "  const CHUNK_SIZE = constants.CHUNK_SIZE;" or something?
                  # No, CHUNK_SIZE is global.

                  # Let's find the next top-level like construct
                  next_func = content.find("  io.on('connection'", gc_start)
                  gc_block = content[gc_start:next_func]

                  # Remove it from current position
                  content = content[:gc_start] + content[next_func:]

                  # Insert it before startServer
                  content = content[:ss_start] + gc_block + "\n" + content[ss_start:]

    with open('server.ts', 'w') as f:
        f.write(content)
    print("Successfully refactored server.ts io and generateChunk")

if __name__ == "__main__":
    main()
