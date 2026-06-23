import { io } from 'socket.io-client';
const socket = io('http://localhost:4000');
socket.on('connect', () => {
  console.log('Connected');
  socket.emit('adminAuthenticate', { username: 'john', password: '0601' });
});
socket.on('adminAuthenticated', (data) => {
  console.log('Auth:', data);
  if (data.success) {
    socket.emit('adminGrantCurrency', { targetUsername: 'man', type: 'goldCoins', amount: 1000 });
  }
});
socket.on('adminActionSuccess', (data) => {
  console.log('Success:', data);
  process.exit(0);
});
setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 3000);
