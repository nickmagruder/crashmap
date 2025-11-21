var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.crashmap_Server>("crashmap-server");

builder.Build().Run();
