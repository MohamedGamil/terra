/**
 * Compact Binary Delta State Encoder for Terra Networking Protocol.
 * Minimizes bandwidth overhead via Uint32/Uint16 binary tuple packets.
 */

export class DeltaEncoder {
  /**
   * Encode modified pixel deltas for a tick into a Uint8Array binary buffer.
   * Packet Structure:
   * [0..3]: Uint32 Magic Header (0x54455252 = 'TERR')
   * [4..7]: Uint32 Tick Number
   * [8..11]: Uint32 Delta Count (N)
   * [12..12+N*6]: Array of [Uint32 pixelIndex, Uint16 ownerId]
   */
  static encodeDelta(tickCount, modifiedPixels) {
    const count = modifiedPixels.length;
    const headerSize = 12;
    const itemSize = 6; // 4 bytes uint32 + 2 bytes uint16
    const totalSize = headerSize + count * itemSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Write Header
    view.setUint32(0, 0x54455252, true); // Magic Header 'TERR'
    view.setUint32(4, tickCount, true);
    view.setUint32(8, count, true);

    // Write Pixel Deltas
    let offset = headerSize;
    for (let i = 0; i < count; i++) {
      const item = modifiedPixels[i];
      view.setUint32(offset, item.idx, true);
      view.setUint16(offset + 4, item.owner, true);
      offset += itemSize;
    }

    return new Uint8Array(buffer);
  }

  /**
   * Decode binary delta buffer back into delta items.
   */
  static decodeDelta(uint8Array) {
    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    const magic = view.getUint32(0, true);
    if (magic !== 0x54455252) throw new Error('Invalid Terra protocol magic header');

    const tickCount = view.getUint32(4, true);
    const count = view.getUint32(8, true);

    const deltas = new Array(count);
    let offset = 12;
    for (let i = 0; i < count; i++) {
      const idx = view.getUint32(offset, true);
      const owner = view.getUint16(offset + 4, true);
      deltas[i] = { idx, owner };
      offset += 6;
    }

    return { tickCount, count, deltas };
  }
}
