import { Controller, Get, Param, Post } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

@Controller('rooms')
export class RoomsController {
  private rooms: Set<string> = new Set();

  @Post()
  createRoom(): { roomId: string } {
    const roomId = uuidv4();
    this.rooms.add(roomId);
    return { roomId };
  }

  @Get(':id')
  checkRoom(@Param('id') id: string): { exists: boolean } {
    return { exists: this.rooms.has(id) };
  }
}