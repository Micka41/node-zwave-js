// TODO: Get rid of this entire thing and use the serialport-based mocking instead.

import { ZWaveLogContainer } from "@zwave-js/core";
import { Mixin } from "@zwave-js/shared";
import { EventEmitter } from "events";
import sinon from "sinon";
import { PassThrough } from "stream";
import {
	MockBinding as SerialPortMockBinding,
	type MockPortBinding as SerialPortMockPortBinding,
} from "./SerialPortBindingMock";
import { SerialPortMock } from "./SerialPortMock";
import { ZWaveSerialPort } from "./ZWaveSerialPort";
import type { ZWaveSerialPortEventCallbacks } from "./ZWaveSerialPortBase";

const instances = new Map<string, MockSerialPort>();

@Mixin([EventEmitter])
class MockBinding extends PassThrough {}

interface MockSerialPortEventCallbacks extends ZWaveSerialPortEventCallbacks {
	write: (data: Buffer) => void;
}

type MockSerialPortEvents = Extract<keyof MockSerialPortEventCallbacks, string>;

export interface MockSerialPort {
	on<TEvent extends MockSerialPortEvents>(
		event: TEvent,
		callback: MockSerialPortEventCallbacks[TEvent],
	): this;
	addListener<TEvent extends MockSerialPortEvents>(
		event: TEvent,
		callback: MockSerialPortEventCallbacks[TEvent],
	): this;
	once<TEvent extends MockSerialPortEvents>(
		event: TEvent,
		callback: MockSerialPortEventCallbacks[TEvent],
	): this;
	off<TEvent extends MockSerialPortEvents>(
		event: TEvent,
		callback: MockSerialPortEventCallbacks[TEvent],
	): this;
	removeListener<TEvent extends MockSerialPortEvents>(
		event: TEvent,
		callback: MockSerialPortEventCallbacks[TEvent],
	): this;
	removeAllListeners(event?: MockSerialPortEvents): this;

	emit<TEvent extends MockSerialPortEvents>(
		event: TEvent,
		...args: Parameters<MockSerialPortEventCallbacks[TEvent]>
	): boolean;
}

export class MockSerialPort extends ZWaveSerialPort {
	constructor(port: string, loggers: ZWaveLogContainer) {
		super(port, loggers, MockBinding as any);
		instances.set(port, this);
	}

	public static getInstance(port: string): MockSerialPort | undefined {
		return instances.get(port);
	}

	private __isOpen: boolean = false;
	public get isOpen(): boolean {
		return this.__isOpen;
	}

	public open(): Promise<void> {
		return this.openStub().then(() => {
			this.__isOpen = true;
		});
	}
	public readonly openStub = sinon.stub().resolves();

	public close(): Promise<void> {
		return this.closeStub().then(() => {
			this.__isOpen = false;
		});
	}
	public readonly closeStub = sinon.stub().resolves();

	public receiveData(data: Buffer): void {
		this.serial.emit("data", data);
	}

	public raiseError(err: Error): void {
		this.emit("error", err);
	}

	public writeAsync(data: Buffer): Promise<void> {
		this._lastWrite = data;
		this.emit("write", data);
		return this.writeStub(data);
	}
	public readonly writeStub = sinon.stub();

	private _lastWrite: string | number[] | Buffer | undefined;
	public get lastWrite(): string | number[] | Buffer | undefined {
		return this._lastWrite;
	}
}

export async function createAndOpenMockedZWaveSerialPort(
	path: string,
): Promise<{
	port: ZWaveSerialPort;
	binding: SerialPortMockPortBinding;
}> {
	SerialPortMockBinding.reset();
	SerialPortMockBinding.createPort(path, {
		record: true,
		readyData: Buffer.from([]),
	});

	const port = new ZWaveSerialPort(
		path,
		new ZWaveLogContainer({
			enabled: false,
		}),
		// @ts-expect-error We're using an internal signature here
		SerialPortMock,
	);
	await port.open();
	const binding = (port["serial"] as SerialPortMock).port!;
	return { port, binding };
}
