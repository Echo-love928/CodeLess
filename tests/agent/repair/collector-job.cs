// Windows-only test harness ownership. Assign while suspended, before any descendant can start.
// No breakaway flag; retain the job after the root exits. Never select processes by name or PID alone.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public sealed class CollectorJob : IDisposable {
    IntPtr job;
    public Process Process { get; private set; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimit {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveLimit; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit {
        public BasicLimit Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
        public uint Size; public string Reserved, Desktop, Title; public uint X,Y,XSize,YSize,XChars,YChars,Fill,Flags;
        public ushort Show, ReservedSize; public IntPtr ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint Pid, Tid; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimit info,uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting info,uint length,IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string file,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static void Check(bool ok) { if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static string Quote(string value) {
        var text=new StringBuilder("\"");int slashes=0;
        foreach(char c in value){if(c=='\\'){slashes++;continue;}text.Append('\\',c=='"'?slashes*2+1:slashes);text.Append(c);slashes=0;}
        return text.Append('\\',slashes*2).Append('"').ToString();
    }
    public CollectorJob() {
        job=CreateJobObject(IntPtr.Zero,null);Check(job!=IntPtr.Zero);
        try { var info=new ExtendedLimit();info.Basic.Flags=0x2000; // KILL_ON_JOB_CLOSE
            Check(SetInformationJobObject(job,9,ref info,(uint)Marshal.SizeOf<ExtendedLimit>()));
        }catch{Dispose();throw;}
    }
    public void Start(ProcessStartInfo info) {
        if(Process!=null||job==IntPtr.Zero)throw new InvalidOperationException("Job already started or closed");
        if(info.UseShellExecute||info.RedirectStandardOutput||info.RedirectStandardError||info.RedirectStandardInput)
            throw new InvalidOperationException("Collector job requires the fixed nonredirected child");
        var command=new StringBuilder(Quote(info.FileName));foreach(string argument in info.ArgumentList)command.Append(' ').Append(Quote(argument));
        var startup=new Startup{Size=(uint)Marshal.SizeOf<Startup>()};ProcessInfo native=default;
        Check(CreateProcess(info.FileName,command,IntPtr.Zero,IntPtr.Zero,false,0x08000004,IntPtr.Zero,
            String.IsNullOrEmpty(info.WorkingDirectory)?null:info.WorkingDirectory,ref startup,out native)); // NO_WINDOW | SUSPENDED
        try {
            Check(AssignProcessToJobObject(job,native.Process));
            Process=Process.GetProcessById((int)native.Pid);_ = Process.Handle; // retain the root exit status
            Check(ResumeThread(native.Thread)!=UInt32.MaxValue);
        }catch{TerminateProcess(native.Process,1);TerminateJobObject(job,1);throw;}
        finally{CloseHandle(native.Thread);CloseHandle(native.Process);}
    }
    public int ActiveProcesses {
        get { Check(QueryInformationJobObject(job,1,out var info,(uint)Marshal.SizeOf<Accounting>(),IntPtr.Zero));return checked((int)info.ActiveProcesses); }
    }
    public bool Stop(int timeoutMs) {
        if(ActiveProcesses>0)Check(TerminateJobObject(job,1));
        var watch=Stopwatch.StartNew();while(ActiveProcesses>0&&watch.ElapsedMilliseconds<timeoutMs)Thread.Sleep(10);
        return ActiveProcesses==0&&(Process==null||Process.WaitForExit(Math.Max(0,timeoutMs-(int)watch.ElapsedMilliseconds)));
    }
    public void Dispose() { if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;} }
}
