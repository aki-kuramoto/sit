export namespace config {
	
	export class BellAction {
	    type: string;
	    file?: string;
	
	    static createFrom(source: any = {}) {
	        return new BellAction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.file = source["file"];
	    }
	}
	export class ShellProfile {
	    name: string;
	    command: string;
	    args: string[];
	    env?: string[];
	    pathAppend?: string[];
	
	    static createFrom(source: any = {}) {
	        return new ShellProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.env = source["env"];
	        this.pathAppend = source["pathAppend"];
	    }
	}
	export class TerminalKeyBinding {
	    key: string;
	    guards?: string;
	    action: string;
	
	    static createFrom(source: any = {}) {
	        return new TerminalKeyBinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.guards = source["guards"];
	        this.action = source["action"];
	    }
	}
	export class Config {
	    keybindings: Record<string, string>;
	    terminalKeybindings: TerminalKeyBinding[];
	    bellActions: BellAction[];
	    shell: string;
	    fontSize: number;
	    fontFamily: string;
	    commandModeTimeout: number;
	    commandModePrefix: string;
	    onExit: string;
	    startupBehavior: string;
	    theme: string;
	    themeOverrides: Record<string, string>;
	    shellProfiles: ShellProfile[];
	    autoImeControl: boolean;
	    onTerminalFocusCommand?: string;
	    onInputFocusCommand?: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.keybindings = source["keybindings"];
	        this.terminalKeybindings = this.convertValues(source["terminalKeybindings"], TerminalKeyBinding);
	        this.bellActions = this.convertValues(source["bellActions"], BellAction);
	        this.shell = source["shell"];
	        this.fontSize = source["fontSize"];
	        this.fontFamily = source["fontFamily"];
	        this.commandModeTimeout = source["commandModeTimeout"];
	        this.commandModePrefix = source["commandModePrefix"];
	        this.onExit = source["onExit"];
	        this.startupBehavior = source["startupBehavior"];
	        this.theme = source["theme"];
	        this.themeOverrides = source["themeOverrides"];
	        this.shellProfiles = this.convertValues(source["shellProfiles"], ShellProfile);
	        this.autoImeControl = source["autoImeControl"];
	        this.onTerminalFocusCommand = source["onTerminalFocusCommand"];
	        this.onInputFocusCommand = source["onInputFocusCommand"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

