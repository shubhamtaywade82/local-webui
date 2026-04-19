declare module 'socket.io-client-v2' {
  const io: (uri?: string, opts?: Record<string, unknown>) => any;
  export default io;
}
